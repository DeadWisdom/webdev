/**
 * Firebase sync plugin - real-time database synchronization
 */

import type { Plugin, Collection, Doc, ChangeEvent } from '../../types.ts';
import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  get,
  remove,
  onValue,
  type Database,
  type DatabaseReference,
  type Unsubscribe,
  serverTimestamp,
  onDisconnect
} from 'firebase/database';

export interface FirebaseSyncOptions {
  config: FirebaseOptions;
  path?: string;           // Database path, defaults to collection name
  realtime?: boolean;      // Enable real-time listeners (default: true)
  push?: boolean;          // Push changes to Firebase (default: true)
  pull?: boolean;          // Pull changes from Firebase (default: true)
  useServerTimestamp?: boolean; // Use Firebase server timestamps (default: true)
  conflictResolution?: 'local-wins' | 'server-wins' | 'merge' | 'error';
  offline?: boolean;       // Enable offline persistence (default: true)
  presence?: boolean;      // Enable presence detection (default: false)
  batchWrites?: boolean;   // Batch multiple writes (default: true)
}

interface PresenceInfo {
  online: boolean;
  lastSeen: number;
  clientId: string;
}

export function firebaseSync(options: FirebaseSyncOptions): Plugin {
  const config: Required<FirebaseSyncOptions> = {
    config: options.config,
    path: options.path || '',
    realtime: options.realtime ?? true,
    push: options.push ?? true,
    pull: options.pull ?? true,
    useServerTimestamp: options.useServerTimestamp ?? true,
    conflictResolution: options.conflictResolution ?? 'server-wins',
    offline: options.offline ?? true,
    presence: options.presence ?? false,
    batchWrites: options.batchWrites ?? true
  };

  let collection: Collection | null = null;
  let firebaseApp: FirebaseApp | null = null;
  let database: Database | null = null;
  let collectionRef: DatabaseReference | null = null;
  let unsubscribeListeners: Unsubscribe[] = [];
  let isInitialLoad = true;
  let batchOperations: Array<() => Promise<void>> = [];
  let batchTimeout: number | null = null;
  let clientId = Math.random().toString(36).substring(2);

  return {
    name: 'firebaseSync',

    async install(col: Collection) {
      collection = col;

      try {
        // Initialize Firebase app
        firebaseApp = initializeApp(config.config);
        database = getDatabase(firebaseApp);

        // Enable offline persistence
        if (config.offline && typeof window !== 'undefined') {
          try {
            // Note: Offline persistence needs to be enabled before any database operations
            const { goOffline, goOnline } = await import('firebase/database');
            goOffline(database);
            goOnline(database);
          } catch (error) {
            console.warn('Firebase offline persistence setup failed:', error);
          }
        }

        // Set up database reference
        const path = config.path || collection.name;
        collectionRef = ref(database, path);

        // Set up presence if enabled
        if (config.presence) {
          await setupPresence();
        }

        // Initial pull if enabled
        if (config.pull) {
          await pullFromFirebase();
        }

        // Set up real-time listeners if enabled
        if (config.realtime && config.pull) {
          setupRealtimeListeners();
        }

        // Set up push sync if enabled
        if (config.push) {
          const changeHandler = async (e: Event) => {
            const changeEvent = e as ChangeEvent;
            const { op, id, doc, remote } = changeEvent.detail;

            // Don't sync remote changes back to Firebase
            if (remote) return;

            try {
              if (config.batchWrites) {
                batchOperation(() => pushToFirebase(op, id, doc));
              } else {
                await pushToFirebase(op, id, doc);
              }
            } catch (error) {
              console.warn('Firebase sync: Push failed:', error);

              // Emit sync error
              if (collection) {
                collection.dispatchEvent(new CustomEvent('sync:error', {
                  detail: {
                    collection: collection.name,
                    adapter: 'firebase',
                    operation: op,
                    error
                  }
                }));
              }
            }
          };

          col.addEventListener('change', changeHandler);
        }

      } catch (error) {
        console.error('Firebase sync initialization failed:', error);
        throw error;
      }
    },

    async destroy() {
      // Unsubscribe from all listeners
      unsubscribeListeners.forEach(unsubscribe => unsubscribe());
      unsubscribeListeners = [];

      // Clear batch timeout
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
      }

      // Execute pending batch operations
      if (batchOperations.length > 0) {
        await executeBatch();
      }

      // Cleanup references
      collectionRef = null;
      database = null;
      firebaseApp = null;
      collection = null;
    }
  };

  // Set up presence detection
  async function setupPresence(): Promise<void> {
    if (!database || !collection) return;

    const presenceRef = ref(database, `.info/connected`);
    const userPresenceRef = ref(database, `presence/${collection.name}/${clientId}`);

    const connectedListener = onValue(presenceRef, (snapshot) => {
      if (snapshot.val() === true) {
        // User is online
        const presenceInfo: PresenceInfo = {
          online: true,
          lastSeen: Date.now(),
          clientId
        };

        set(userPresenceRef, presenceInfo);

        // Set up disconnect handler
        onDisconnect(userPresenceRef).set({
          online: false,
          lastSeen: serverTimestamp(),
          clientId
        });

        // Emit presence event
        if (collection) {
          collection.dispatchEvent(new CustomEvent('sync:presence', {
            detail: {
              collection: collection.name,
              adapter: 'firebase',
              status: 'online',
              clientId
            }
          }));
        }
      }
    });

    unsubscribeListeners.push(connectedListener);
  }

  // Pull data from Firebase
  async function pullFromFirebase(): Promise<void> {
    if (!collectionRef || !collection) return;

    try {
      const snapshot = await get(collectionRef);

      if (!snapshot.exists()) {
        return; // No data
      }

      const data = snapshot.val();
      let changeCount = 0;

      for (const [id, docData] of Object.entries(data)) {
        if (docData && typeof docData === 'object') {
          const doc = { id, ...docData } as Doc;
          const existing = await collection.get(id);

          if (!existing) {
            // New document
            await collection.put(doc, { remote: true });
            changeCount++;
          } else {
            // Check for conflicts
            const shouldUpdate = await resolveConflict(existing, doc);
            if (shouldUpdate) {
              await collection.put(doc, { remote: true });
              changeCount++;
            }
          }
        }
      }

      // Emit sync complete event
      collection.dispatchEvent(new CustomEvent('sync:complete', {
        detail: {
          collection: collection.name,
          adapter: 'firebase',
          operation: 'pull',
          count: changeCount
        }
      }));

    } catch (error) {
      if (collection) {
        collection.dispatchEvent(new CustomEvent('sync:error', {
          detail: {
            collection: collection.name,
            adapter: 'firebase',
            operation: 'pull',
            error
          }
        }));
      }

      throw error;
    }
  }

  // Set up real-time listeners
  function setupRealtimeListeners(): void {
    if (!collectionRef || !collection) return;

    const dataListener = onValue(collectionRef, (snapshot) => {
      if (isInitialLoad) {
        isInitialLoad = false;
        return; // Skip initial load since we already pulled
      }

      if (snapshot.exists()) {
        const data = snapshot.val();

        // Process changes
        if (!collection) return;

        for (const [id, docData] of Object.entries(data)) {
          if (docData && typeof docData === 'object') {
            const doc = { id, ...docData } as Doc;

            // Apply change locally with remote flag
            collection.put(doc, { remote: true }).catch(error => {
              console.warn('Firebase real-time sync error:', error);
            });
          }
        }
      }

      // Emit real-time sync event
      if (!collection) return;

      collection.dispatchEvent(new CustomEvent('sync:realtime', {
        detail: {
          collection: collection.name,
          adapter: 'firebase',
          timestamp: Date.now()
        }
      }));
    });

    unsubscribeListeners.push(dataListener);
  }

  // Push operation to Firebase
  async function pushToFirebase(operation: string, id?: string, doc?: Doc): Promise<void> {
    if (!collectionRef || !collection) return;

    try {
      let docRef: DatabaseReference;

      switch (operation) {
        case 'put':
          if (!id || !doc) throw new Error('Missing document data for put operation');

          docRef = ref(database!, `${collectionRef.key}/${id}`);

          // Add server timestamp if enabled
          const docToSave = { ...doc };
          if (config.useServerTimestamp) {
            docToSave.serverTimestamp = serverTimestamp();
          }

          await set(docRef, docToSave);
          break;

        case 'delete':
          if (!id) throw new Error('Missing document ID for delete operation');

          docRef = ref(database!, `${collectionRef.key}/${id}`);
          await remove(docRef);
          break;

        case 'clear':
          await set(collectionRef, null);
          break;

        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      // Emit sync event
      collection.dispatchEvent(new CustomEvent('sync:complete', {
        detail: {
          collection: collection.name,
          adapter: 'firebase',
          operation,
          id
        }
      }));

    } catch (error) {
      if (collection) {
        collection.dispatchEvent(new CustomEvent('sync:error', {
          detail: {
            collection: collection.name,
            adapter: 'firebase',
            operation,
            error
          }
        }));
      }

      throw error;
    }
  }

  // Batch operation helper
  function batchOperation(operation: () => Promise<void>): void {
    batchOperations.push(operation);

    // Set up batch execution timeout
    if (!batchTimeout) {
      batchTimeout = setTimeout(executeBatch, 100) as any; // 100ms batch window
    }
  }

  // Execute batched operations
  async function executeBatch(): Promise<void> {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }

    const operations = batchOperations.splice(0); // Take all operations

    if (operations.length === 0) return;

    try {
      // Execute all operations in parallel
      await Promise.allSettled(operations.map(op => op()));

      // Emit batch complete event
      if (collection) {
        collection.dispatchEvent(new CustomEvent('sync:batch', {
          detail: {
            collection: collection.name,
            adapter: 'firebase',
            count: operations.length
          }
        }));
      }

    } catch (error) {
      console.warn('Firebase batch execution failed:', error);
    }
  }

  // Resolve conflicts between local and Firebase documents
  async function resolveConflict(local: Doc, remote: Doc): Promise<boolean> {
    const localTime = (local.updatedAt || local.lastModified || 0) as number;
    const remoteTime = (remote.updatedAt || remote.lastModified || remote.serverTimestamp || 0) as number;

    switch (config.conflictResolution) {
      case 'local-wins':
        return false; // Keep local version

      case 'server-wins':
        return true; // Use Firebase version

      case 'merge':
        // Simple merge: Firebase wins for conflicts, but keep local-only fields
        // TODO: implement more sophisticated merging
        return true; // For now, just use Firebase version

      case 'error':
        if (collection) {
          collection.dispatchEvent(new CustomEvent('sync:conflict', {
            detail: {
              collection: collection.name,
              id: local.id,
              local,
              remote,
              resolution: 'error'
            }
          }));
        }
        throw new Error(`Conflict detected for document ${local.id}`);

      default:
        return remoteTime > localTime; // Timestamp-based resolution
    }
  }
}