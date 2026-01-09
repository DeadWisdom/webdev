/**
 * Firestore plugin - real-time Firestore synchronization
 */

import type { Plugin, Collection, Doc, ChangeEvent, WriteOptions } from '../../types.ts';
import * as firestoreSdk from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';

type Firestore = firestoreSdk.Firestore;
type CollectionReference = firestoreSdk.CollectionReference;
type Unsubscribe = firestoreSdk.Unsubscribe;

export interface FirestoreOptions {
  /** Firestore database instance - if not provided, will be created from app */
  firestore?: Firestore;
  /** Firebase app instance - used to create Firestore if firestore not provided */
  app?: FirebaseApp;
  /** Collection path in Firestore, defaults to localstore collection name */
  path?: string;
  /** Enable real-time listeners (default: true) */
  realtime?: boolean;
  /** Push local changes to Firestore (default: true) */
  push?: boolean;
  /** Pull changes from Firestore (default: true) */
  pull?: boolean;
  /** Use Firebase server timestamps (default: true) */
  useServerTimestamp?: boolean;
  /** Conflict resolution strategy (default: 'server-wins') */
  conflictResolution?: 'local-wins' | 'server-wins' | 'merge';
  /** Batch multiple writes within a time window (default: true) */
  batchWrites?: boolean;
  /** Batch window in milliseconds (default: 100) */
  batchWindow?: number;
  /**
   * Idle TTL in milliseconds - unsubscribe from Firestore after this period
   * with no subscribers. Set to 0 to disable. (default: 7000)
   */
  idleTTL?: number;
  /** @internal Testing hooks */
  _testing?: Partial<typeof firestoreSdk>;
}

export function firestore(options: FirestoreOptions): Plugin {
  // Allow injecting mocks for testing
  const sdk = { ...firestoreSdk, ...options._testing };
  if (!options.firestore && !options.app) {
    throw new Error('firestore plugin requires either a Firestore instance or Firebase app');
  }

  const config = {
    path: options.path ?? '',
    realtime: options.realtime ?? true,
    push: options.push ?? true,
    pull: options.pull ?? true,
    useServerTimestamp: options.useServerTimestamp ?? true,
    conflictResolution: options.conflictResolution ?? 'server-wins',
    batchWrites: options.batchWrites ?? true,
    batchWindow: options.batchWindow ?? 100,
    idleTTL: options.idleTTL ?? 7000
  };

  let localCollection: Collection | null = null;
  let db: Firestore | null = null;
  let collectionRef: CollectionReference | null = null;
  let unsubscribe: Unsubscribe | null = null;
  let isInitialLoad = true;

  // Batch write tracking
  let pendingWrites: Map<string, { op: 'put' | 'delete'; doc?: Doc }> = new Map();
  let batchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Idle TTL tracking
  let idleTimeout: ReturnType<typeof setTimeout> | null = null;
  let isIdle = false;

  return {
    name: 'firestore',

    async install(col: Collection) {
      localCollection = col;

      // Get or create Firestore instance
      db = options.firestore ?? sdk.getFirestore(options.app!);

      // Set up collection reference
      const path = config.path || col.name;
      collectionRef = sdk.collection(db, path) as CollectionReference;

      // Initial pull if enabled
      if (config.pull) {
        await pullFromFirestore();
      }

      // Set up real-time listener if enabled
      if (config.realtime && config.pull) {
        setupRealtimeListener();
      }

      // Set up push handler if enabled
      if (config.push) {
        col.addEventListener('change', handleLocalChange as EventListener);
      }

      // Set up idle TTL handling
      if (config.idleTTL > 0) {
        col.addEventListener('subscribers', handleSubscribersChange as EventListener);
      }
    },

    async destroy() {
      // Cancel idle timeout
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
      }

      // Unsubscribe from real-time updates
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      // Flush pending batch writes
      if (batchTimeout) {
        clearTimeout(batchTimeout);
        batchTimeout = null;
      }
      if (pendingWrites.size > 0) {
        await flushBatch();
      }

      // Remove listeners
      if (localCollection) {
        if (config.push) {
          localCollection.removeEventListener('change', handleLocalChange as EventListener);
        }
        if (config.idleTTL > 0) {
          localCollection.removeEventListener('subscribers', handleSubscribersChange as EventListener);
        }
      }

      // Cleanup references
      collectionRef = null;
      db = null;
      localCollection = null;
    }
  };

  async function pullFromFirestore(): Promise<void> {
    if (!collectionRef || !localCollection) return;

    const snapshot = await sdk.getDocs(collectionRef);
    let changeCount = 0;

    for (const docSnap of snapshot.docs) {
      const doc = { id: docSnap.id, ...docSnap.data() } as Doc;
      const existing = await localCollection.get(docSnap.id);

      if (!existing) {
        await localCollection.put(doc, { remote: true });
        changeCount++;
      } else {
        const shouldUpdate = resolveConflict(existing, doc);
        if (shouldUpdate) {
          await localCollection.put(doc, { remote: true });
          changeCount++;
        }
      }
    }

    localCollection.dispatchEvent(new CustomEvent('sync:complete', {
      detail: {
        collection: localCollection.name,
        adapter: 'firestore',
        operation: 'pull',
        count: changeCount
      }
    }));
  }

  function setupRealtimeListener(): void {
    if (!collectionRef || !localCollection) return;

    unsubscribe = sdk.onSnapshot(collectionRef, (snapshot) => {
      if (isInitialLoad) {
        isInitialLoad = false;
        return; // Skip initial since we already pulled
      }

      if (!localCollection) return;

      for (const change of snapshot.docChanges()) {
        const doc = { id: change.doc.id, ...change.doc.data() } as Doc;

        if (change.type === 'removed') {
          localCollection.delete(change.doc.id, { remote: true }).catch(console.warn);
        } else {
          localCollection.put(doc, { remote: true }).catch(console.warn);
        }
      }

      localCollection.dispatchEvent(new CustomEvent('sync:realtime', {
        detail: {
          collection: localCollection.name,
          adapter: 'firestore',
          timestamp: Date.now()
        }
      }));
    }, (error) => {
      if (localCollection) {
        localCollection.dispatchEvent(new CustomEvent('sync:error', {
          detail: {
            collection: localCollection.name,
            adapter: 'firestore',
            operation: 'realtime',
            error
          }
        }));
      }
    });
  }

  function handleLocalChange(e: Event): void {
    const changeEvent = e as ChangeEvent;
    const { op, id, doc, remote } = changeEvent.detail;

    // Don't echo remote changes back
    if (remote) return;

    if (op === 'clear') {
      // Handle clear separately - not batched
      clearFirestore().catch(console.warn);
      return;
    }

    if (!id) return;

    if (config.batchWrites) {
      pendingWrites.set(id, { op, doc });
      scheduleBatch();
    } else {
      pushToFirestore(op, id, doc).catch(console.warn);
    }
  }

  function handleSubscribersChange(e: Event): void {
    const { count } = (e as CustomEvent).detail;

    if (count === 0 && pendingWrites.size === 0 && !batchTimeout) {
      // No subscribers and no pending writes - start idle timer
      startIdleTimer();
    } else if (count > 0) {
      // Subscribers came back - cancel idle timer and reactivate if needed
      cancelIdleTimer();
      if (isIdle) {
        reactivate();
      }
    }
  }

  function startIdleTimer(): void {
    if (idleTimeout) return;

    idleTimeout = setTimeout(() => {
      idleTimeout = null;
      goIdle();
    }, config.idleTTL);
  }

  function cancelIdleTimer(): void {
    if (idleTimeout) {
      clearTimeout(idleTimeout);
      idleTimeout = null;
    }
  }

  function goIdle(): void {
    if (isIdle) return;
    isIdle = true;

    // Unsubscribe from Firestore real-time updates to save resources
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    if (localCollection) {
      localCollection.dispatchEvent(new CustomEvent('sync:idle', {
        detail: {
          collection: localCollection.name,
          adapter: 'firestore'
        }
      }));
    }
  }

  function reactivate(): void {
    if (!isIdle) return;
    isIdle = false;
    isInitialLoad = false; // Don't skip first snapshot since we missed updates

    // Re-establish real-time listener
    if (config.realtime && config.pull) {
      setupRealtimeListener();
    }

    if (localCollection) {
      localCollection.dispatchEvent(new CustomEvent('sync:active', {
        detail: {
          collection: localCollection.name,
          adapter: 'firestore'
        }
      }));
    }
  }

  function scheduleBatch(): void {
    if (batchTimeout) return;
    batchTimeout = setTimeout(() => {
      batchTimeout = null;
      flushBatch().catch(console.warn);
    }, config.batchWindow);
  }

  async function flushBatch(): Promise<void> {
    if (!db || !collectionRef || pendingWrites.size === 0) return;

    const writes = new Map(pendingWrites);
    pendingWrites.clear();

    const batch = sdk.writeBatch(db);

    for (const [id, { op, doc }] of writes) {
      const docRef = sdk.doc(collectionRef!, id);

      if (op === 'delete') {
        batch.delete(docRef);
      } else if (op === 'put' && doc) {
        const { id: _id, ...data } = doc;
        if (config.useServerTimestamp) {
          (data as Record<string, unknown>).updatedAt = sdk.serverTimestamp();
        }
        batch.set(docRef, data);
      }
    }

    await batch.commit();

    if (localCollection) {
      localCollection.dispatchEvent(new CustomEvent('sync:batch', {
        detail: {
          collection: localCollection.name,
          adapter: 'firestore',
          count: writes.size
        }
      }));
    }
  }

  async function pushToFirestore(op: 'put' | 'delete', id: string, doc?: Doc): Promise<void> {
    if (!db || !collectionRef || !localCollection) return;

    const docRef = sdk.doc(collectionRef, id);

    if (op === 'delete') {
      await sdk.deleteDoc(docRef);
    } else if (op === 'put' && doc) {
      const { id: _id, ...data } = doc;
      if (config.useServerTimestamp) {
        (data as Record<string, unknown>).updatedAt = sdk.serverTimestamp();
      }
      await sdk.setDoc(docRef, data);
    }

    localCollection.dispatchEvent(new CustomEvent('sync:complete', {
      detail: {
        collection: localCollection.name,
        adapter: 'firestore',
        operation: op,
        id
      }
    }));
  }

  async function clearFirestore(): Promise<void> {
    if (!db || !collectionRef || !localCollection) return;

    const snapshot = await sdk.getDocs(collectionRef);
    const batch = sdk.writeBatch(db);

    for (const docSnap of snapshot.docs) {
      batch.delete(docSnap.ref);
    }

    await batch.commit();

    localCollection.dispatchEvent(new CustomEvent('sync:complete', {
      detail: {
        collection: localCollection.name,
        adapter: 'firestore',
        operation: 'clear'
      }
    }));
  }

  function resolveConflict(local: Doc, remote: Doc): boolean {
    switch (config.conflictResolution) {
      case 'local-wins':
        return false;
      case 'server-wins':
        return true;
      case 'merge':
        // Simple merge: prefer remote for conflicts
        return true;
      default:
        // Timestamp-based fallback
        const localTime = (local.updatedAt || 0) as number;
        const remoteTime = (remote.updatedAt || 0) as number;
        return remoteTime > localTime;
    }
  }
}
