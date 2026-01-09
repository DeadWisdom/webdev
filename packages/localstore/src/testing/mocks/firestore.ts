/**
 * Mock Firestore SDK for testing
 */

import type { Firestore } from 'firebase/firestore';
import type { FirebaseApp } from 'firebase/app';

export interface MockDocSnapshot {
  id: string;
  data(): Record<string, unknown> | undefined;
  exists(): boolean;
  ref: MockDocRef;
}

export interface MockDocChange {
  type: 'added' | 'modified' | 'removed';
  doc: MockDocSnapshot;
}

export interface MockQuerySnapshot {
  docs: MockDocSnapshot[];
  docChanges(): MockDocChange[];
  empty: boolean;
  size: number;
}

export interface MockDocRef {
  id: string;
  path: string;
}

export interface MockCollectionRef {
  id: string;
  path: string;
}

export interface MockWriteBatch {
  set(ref: MockDocRef, data: Record<string, unknown>): MockWriteBatch;
  delete(ref: MockDocRef): MockWriteBatch;
  commit(): Promise<void>;
}

export interface FirestoreMockState {
  /** All documents stored by path */
  data: Map<string, Record<string, unknown>>;
  /** All calls made to Firestore */
  calls: Array<{ method: string; path: string; data?: unknown }>;
  /** Active snapshot listeners */
  listeners: Map<string, Set<(snapshot: MockQuerySnapshot) => void>>;
  /** Error listeners */
  errorListeners: Map<string, Set<(error: Error) => void>>;
}

export function createFirestoreMock() {
  const state: FirestoreMockState = {
    data: new Map(),
    calls: [],
    listeners: new Map(),
    errorListeners: new Map()
  };

  function getDocsInCollection(collectionPath: string): MockDocSnapshot[] {
    const docs: MockDocSnapshot[] = [];
    const prefix = collectionPath + '/';

    for (const [path, data] of state.data) {
      if (path.startsWith(prefix)) {
        const id = path.slice(prefix.length);
        // Only include direct children (no nested paths)
        if (!id.includes('/')) {
          docs.push(createDocSnapshot(id, path, data));
        }
      }
    }

    return docs;
  }

  function createDocSnapshot(id: string, path: string, data?: Record<string, unknown>): MockDocSnapshot {
    return {
      id,
      data: () => data,
      exists: () => data !== undefined,
      ref: { id, path }
    };
  }

  function notifyListeners(collectionPath: string, changeType: 'added' | 'modified' | 'removed', docId: string, data?: Record<string, unknown>) {
    const listeners = state.listeners.get(collectionPath);
    if (!listeners) return;

    const docPath = `${collectionPath}/${docId}`;
    const docs = getDocsInCollection(collectionPath);
    const changedDoc = createDocSnapshot(docId, docPath, data);

    const snapshot: MockQuerySnapshot = {
      docs,
      docChanges: () => [{ type: changeType, doc: changedDoc }],
      empty: docs.length === 0,
      size: docs.length
    };

    listeners.forEach(callback => callback(snapshot));
  }

  const mockFirestore = {
    name: 'mock-firestore'
  } as unknown as Firestore;

  const mockApp = {
    name: 'mock-app'
  } as unknown as FirebaseApp;

  const mocks = {
    getFirestore: (app?: FirebaseApp) => {
      state.calls.push({ method: 'getFirestore', path: '' });
      return mockFirestore;
    },

    collection: (db: Firestore, path: string): MockCollectionRef => {
      state.calls.push({ method: 'collection', path });
      return { id: path.split('/').pop() || path, path };
    },

    doc: (collectionRef: MockCollectionRef, id: string): MockDocRef => {
      const path = `${collectionRef.path}/${id}`;
      state.calls.push({ method: 'doc', path });
      return { id, path };
    },

    getDocs: async (collectionRef: MockCollectionRef): Promise<MockQuerySnapshot> => {
      state.calls.push({ method: 'getDocs', path: collectionRef.path });
      const docs = getDocsInCollection(collectionRef.path);
      return {
        docs,
        docChanges: () => docs.map(doc => ({ type: 'added' as const, doc })),
        empty: docs.length === 0,
        size: docs.length
      };
    },

    setDoc: async (ref: MockDocRef, data: Record<string, unknown>): Promise<void> => {
      state.calls.push({ method: 'setDoc', path: ref.path, data });
      const exists = state.data.has(ref.path);
      state.data.set(ref.path, data);

      // Get collection path
      const parts = ref.path.split('/');
      parts.pop();
      const collectionPath = parts.join('/');

      notifyListeners(collectionPath, exists ? 'modified' : 'added', ref.id, data);
    },

    deleteDoc: async (ref: MockDocRef): Promise<void> => {
      state.calls.push({ method: 'deleteDoc', path: ref.path });
      state.data.delete(ref.path);

      const parts = ref.path.split('/');
      parts.pop();
      const collectionPath = parts.join('/');

      notifyListeners(collectionPath, 'removed', ref.id, undefined);
    },

    onSnapshot: (
      collectionRef: MockCollectionRef,
      callback: (snapshot: MockQuerySnapshot) => void,
      errorCallback?: (error: Error) => void
    ): (() => void) => {
      state.calls.push({ method: 'onSnapshot', path: collectionRef.path });

      // Add listener
      if (!state.listeners.has(collectionRef.path)) {
        state.listeners.set(collectionRef.path, new Set());
      }
      state.listeners.get(collectionRef.path)!.add(callback);

      if (errorCallback) {
        if (!state.errorListeners.has(collectionRef.path)) {
          state.errorListeners.set(collectionRef.path, new Set());
        }
        state.errorListeners.get(collectionRef.path)!.add(errorCallback);
      }

      // Trigger initial snapshot
      const docs = getDocsInCollection(collectionRef.path);
      setTimeout(() => {
        callback({
          docs,
          docChanges: () => docs.map(doc => ({ type: 'added' as const, doc })),
          empty: docs.length === 0,
          size: docs.length
        });
      }, 0);

      // Return unsubscribe function
      return () => {
        state.listeners.get(collectionRef.path)?.delete(callback);
        if (errorCallback) {
          state.errorListeners.get(collectionRef.path)?.delete(errorCallback);
        }
      };
    },

    writeBatch: (db: Firestore): MockWriteBatch => {
      const operations: Array<{ type: 'set' | 'delete'; ref: MockDocRef; data?: Record<string, unknown> }> = [];

      const batch: MockWriteBatch = {
        set(ref: MockDocRef, data: Record<string, unknown>) {
          operations.push({ type: 'set', ref, data });
          return batch;
        },
        delete(ref: MockDocRef) {
          operations.push({ type: 'delete', ref });
          return batch;
        },
        async commit() {
          state.calls.push({ method: 'writeBatch.commit', path: '', data: operations });

          for (const op of operations) {
            if (op.type === 'set' && op.data) {
              const exists = state.data.has(op.ref.path);
              state.data.set(op.ref.path, op.data);

              const parts = op.ref.path.split('/');
              parts.pop();
              const collectionPath = parts.join('/');
              notifyListeners(collectionPath, exists ? 'modified' : 'added', op.ref.id, op.data);
            } else if (op.type === 'delete') {
              state.data.delete(op.ref.path);

              const parts = op.ref.path.split('/');
              parts.pop();
              const collectionPath = parts.join('/');
              notifyListeners(collectionPath, 'removed', op.ref.id, undefined);
            }
          }
        }
      };

      return batch;
    },

    serverTimestamp: () => ({ _serverTimestamp: true })
  };

  return {
    state,
    mocks,
    mockFirestore,
    mockApp,

    /** Reset all mock state */
    reset() {
      state.data.clear();
      state.calls.length = 0;
      state.listeners.clear();
      state.errorListeners.clear();
    },

    /** Seed initial data */
    seed(collectionPath: string, docs: Array<{ id: string; data: Record<string, unknown> }>) {
      for (const doc of docs) {
        state.data.set(`${collectionPath}/${doc.id}`, doc.data);
      }
    },

    /** Simulate an error on a collection */
    simulateError(collectionPath: string, error: Error) {
      const errorListeners = state.errorListeners.get(collectionPath);
      if (errorListeners) {
        errorListeners.forEach(callback => callback(error));
      }
    }
  };
}

export type FirestoreMock = ReturnType<typeof createFirestoreMock>;
