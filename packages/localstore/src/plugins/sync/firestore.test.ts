/**
 * Tests for Firestore plugin
 */

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { localCollection } from '../../registry.ts';
import { memory } from '../storage/memory.ts';
import { firestore, type FirestoreOptions } from './firestore.ts';
import { createFirestoreMock } from '../../testing/mocks/firestore.ts';

let mock = createFirestoreMock();

// Create a test version of firestore that uses our mocks
function createTestFirestore(options: Omit<FirestoreOptions, 'firestore' | 'app'> & { useMockApp?: boolean }) {
  // Inject our mock into the plugin by passing the mock firestore
  return firestore({
    ...options,
    firestore: options.useMockApp ? undefined : mock.mockFirestore,
    app: options.useMockApp ? mock.mockApp : undefined,
    // Override the internal imports - we'll need to modify the plugin for this
    _testing: {
      getFirestore: mock.mocks.getFirestore,
      collection: mock.mocks.collection,
      doc: mock.mocks.doc,
      getDocs: mock.mocks.getDocs,
      setDoc: mock.mocks.setDoc,
      deleteDoc: mock.mocks.deleteDoc,
      onSnapshot: mock.mocks.onSnapshot,
      writeBatch: mock.mocks.writeBatch,
      serverTimestamp: mock.mocks.serverTimestamp
    }
  } as any);
}

beforeEach(() => {
  mock.reset();
});

afterEach(async () => {
  await localCollection.close();
});

test('firestore plugin requires firestore or app', () => {
  expect(() => {
    firestore({} as any);
  }).toThrow('firestore plugin requires either a Firestore instance or Firebase app');
});

test('firestore plugin creates with firestore instance', () => {
  const plugin = firestore({
    firestore: mock.mockFirestore
  });

  expect(plugin.name).toBe('firestore');
  expect(typeof plugin.install).toBe('function');
  expect(typeof plugin.destroy).toBe('function');
});

test('firestore plugin creates with firebase app', () => {
  const plugin = firestore({
    app: mock.mockApp
  });

  expect(plugin.name).toBe('firestore');
});

test('firestore plugin with custom path', () => {
  const plugin = firestore({
    firestore: mock.mockFirestore,
    path: 'lists/abc123/items'
  });

  expect(plugin.name).toBe('firestore');
});

test('firestore plugin with all options', () => {
  const plugin = firestore({
    firestore: mock.mockFirestore,
    path: 'custom/path',
    realtime: false,
    push: true,
    pull: true,
    useServerTimestamp: false,
    conflictResolution: 'local-wins',
    batchWrites: false,
    batchWindow: 50
  });

  expect(plugin.name).toBe('firestore');
});

test('firestore conflict resolution strategies', () => {
  const strategies = ['local-wins', 'server-wins', 'merge'] as const;

  for (const strategy of strategies) {
    const plugin = firestore({
      firestore: mock.mockFirestore,
      conflictResolution: strategy
    });

    expect(plugin.name).toBe('firestore');
  }
});

test('firestore plugin installs on collection', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: false,
    realtime: false,
    push: false
  });

  const col = await localCollection('test-install', memory(), plugin);

  expect(col.name).toBe('test-install');
});

test('firestore pulls initial data on install', async () => {
  mock.seed('todos', [
    { id: 'task1', data: { title: 'Buy milk', done: false } },
    { id: 'task2', data: { title: 'Walk dog', done: true } }
  ]);

  const plugin = createTestFirestore({
    path: 'todos',
    pull: true,
    realtime: false,
    push: false
  });

  const col = await localCollection('test-pull', memory(), plugin);

  // Wait for async pull
  await new Promise(r => setTimeout(r, 10));

  const task1 = await col.get('task1');
  const task2 = await col.get('task2');

  expect(task1).toEqual({ id: 'task1', title: 'Buy milk', done: false });
  expect(task2).toEqual({ id: 'task2', title: 'Walk dog', done: true });
});

test('firestore pushes local changes', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: false,
    realtime: false,
    push: true,
    batchWrites: false
  });

  const col = await localCollection('test-push', memory(), plugin);

  await col.put({ id: 'task1', title: 'New task' });

  // Wait for async push
  await new Promise(r => setTimeout(r, 10));

  const calls = mock.state.calls.filter(c => c.method === 'setDoc');
  expect(calls.length).toBe(1);
  expect(calls[0].path).toBe('todos/task1');
});

test('firestore batches writes', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: false,
    realtime: false,
    push: true,
    batchWrites: true,
    batchWindow: 50
  });

  const col = await localCollection('test-batch', memory(), plugin);

  // Make multiple changes quickly
  await col.put({ id: 'task1', title: 'Task 1' });
  await col.put({ id: 'task2', title: 'Task 2' });
  await col.put({ id: 'task3', title: 'Task 3' });

  // Wait for batch window
  await new Promise(r => setTimeout(r, 100));

  const commitCalls = mock.state.calls.filter(c => c.method === 'writeBatch.commit');
  expect(commitCalls.length).toBe(1);
});

test('firestore handles delete operations', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: false,
    realtime: false,
    push: true,
    batchWrites: false
  });

  const col = await localCollection('test-delete', memory(), plugin);

  await col.put({ id: 'task1', title: 'Task to delete' });
  await new Promise(r => setTimeout(r, 10));

  await col.delete('task1');
  await new Promise(r => setTimeout(r, 10));

  const deleteCalls = mock.state.calls.filter(c => c.method === 'deleteDoc');
  expect(deleteCalls.length).toBe(1);
  expect(deleteCalls[0].path).toBe('todos/task1');
});

test('firestore realtime listener receives updates', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: true,
    realtime: true,
    push: false
  });

  const col = await localCollection('test-realtime', memory(), plugin);

  // Wait for initial snapshot
  await new Promise(r => setTimeout(r, 20));

  // Simulate external change
  mock.mocks.setDoc(
    { id: 'task1', path: 'todos/task1' },
    { title: 'External task' }
  );

  // Wait for listener to fire
  await new Promise(r => setTimeout(r, 20));

  const task = await col.get('task1');
  expect(task?.title).toBe('External task');
});

test('firestore does not echo remote changes back', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: false,
    realtime: false,
    push: true,
    batchWrites: false
  });

  const col = await localCollection('test-no-echo', memory(), plugin);

  // Simulate a remote change
  await col.put({ id: 'task1', title: 'Remote task' }, { remote: true });

  await new Promise(r => setTimeout(r, 10));

  // Should not have pushed this back to Firestore
  const setCalls = mock.state.calls.filter(c => c.method === 'setDoc');
  expect(setCalls.length).toBe(0);
});

test('firestore emits sync events', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: false,
    realtime: false,
    push: true,
    batchWrites: false
  });

  const col = await localCollection('test-events', memory(), plugin);

  const events: string[] = [];
  col.addEventListener('sync:complete', () => events.push('complete'));

  await col.put({ id: 'task1', title: 'Task' });
  await new Promise(r => setTimeout(r, 10));

  expect(events).toContain('complete');
});

test('firestore destroy cleans up listeners', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: true,
    realtime: true,
    push: true
  });

  const col = await localCollection('test-destroy', memory(), plugin);
  await new Promise(r => setTimeout(r, 20));

  await col.close();

  // Listeners should be cleaned up
  expect(mock.state.listeners.get('todos')?.size ?? 0).toBe(0);
});

test('firestore uses server timestamp when enabled', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: false,
    realtime: false,
    push: true,
    batchWrites: false,
    useServerTimestamp: true
  });

  const col = await localCollection('test-timestamp', memory(), plugin);

  await col.put({ id: 'task1', title: 'Task' });
  await new Promise(r => setTimeout(r, 10));

  const setCalls = mock.state.calls.filter(c => c.method === 'setDoc');
  expect(setCalls[0].data).toHaveProperty('updatedAt');
});

test('firestore clear removes all documents', async () => {
  mock.seed('todos', [
    { id: 'task1', data: { title: 'Task 1' } },
    { id: 'task2', data: { title: 'Task 2' } }
  ]);

  const plugin = createTestFirestore({
    path: 'todos',
    pull: true,
    realtime: false,
    push: true
  });

  const col = await localCollection('test-clear', memory(), plugin);
  await new Promise(r => setTimeout(r, 10));

  await col.clear();
  await new Promise(r => setTimeout(r, 10));

  const commitCalls = mock.state.calls.filter(c => c.method === 'writeBatch.commit');
  expect(commitCalls.length).toBeGreaterThan(0);
});

test('firestore goes idle after TTL with no subscribers', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: true,
    realtime: true,
    push: false,
    idleTTL: 50 // Short TTL for testing
  });

  const col = await localCollection('test-idle', memory(), plugin);
  await new Promise(r => setTimeout(r, 20));

  const events: string[] = [];
  col.addEventListener('sync:idle', () => events.push('idle'));

  // Subscribe then unsubscribe
  const unsub = col.subscribe(() => {});
  unsub();

  // Wait for idle TTL
  await new Promise(r => setTimeout(r, 100));

  expect(events).toContain('idle');
});

test('firestore cancels idle timer when subscriber returns', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: true,
    realtime: true,
    push: false,
    idleTTL: 100
  });

  const col = await localCollection('test-cancel-idle', memory(), plugin);
  await new Promise(r => setTimeout(r, 20));

  const events: string[] = [];
  col.addEventListener('sync:idle', () => events.push('idle'));

  // Subscribe, unsubscribe, then resubscribe before TTL
  const unsub1 = col.subscribe(() => {});
  unsub1();

  await new Promise(r => setTimeout(r, 30)); // Wait less than TTL

  const unsub2 = col.subscribe(() => {});

  await new Promise(r => setTimeout(r, 150)); // Wait past original TTL

  expect(events).not.toContain('idle');

  unsub2();
});

test('firestore reactivates when subscriber returns after idle', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: true,
    realtime: true,
    push: false,
    idleTTL: 30
  });

  const col = await localCollection('test-reactivate', memory(), plugin);
  await new Promise(r => setTimeout(r, 20));

  const events: string[] = [];
  col.addEventListener('sync:idle', () => events.push('idle'));
  col.addEventListener('sync:active', () => events.push('active'));

  // Subscribe then unsubscribe
  const unsub1 = col.subscribe(() => {});
  unsub1();

  // Wait for idle
  await new Promise(r => setTimeout(r, 60));
  expect(events).toContain('idle');

  // Resubscribe
  const unsub2 = col.subscribe(() => {});
  await new Promise(r => setTimeout(r, 10));

  expect(events).toContain('active');

  unsub2();
});

test('firestore does not go idle with pending writes', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: false,
    realtime: false,
    push: true,
    batchWrites: true,
    batchWindow: 200, // Long batch window
    idleTTL: 30
  });

  const col = await localCollection('test-pending-writes', memory(), plugin);

  const events: string[] = [];
  col.addEventListener('sync:idle', () => events.push('idle'));

  // Subscribe, make a change, then unsubscribe
  const unsub = col.subscribe(() => {});
  await col.put({ id: 'task1', title: 'Task' });
  unsub();

  // Wait past idle TTL but before batch flushes
  await new Promise(r => setTimeout(r, 60));

  // Should not be idle because writes are pending
  expect(events).not.toContain('idle');

  // Wait for batch to flush
  await new Promise(r => setTimeout(r, 200));
});

test('firestore idleTTL can be disabled', async () => {
  const plugin = createTestFirestore({
    path: 'todos',
    pull: true,
    realtime: true,
    push: false,
    idleTTL: 0 // Disabled
  });

  const col = await localCollection('test-no-idle', memory(), plugin);
  await new Promise(r => setTimeout(r, 20));

  const events: string[] = [];
  col.addEventListener('sync:idle', () => events.push('idle'));

  // Subscribe then unsubscribe
  const unsub = col.subscribe(() => {});
  unsub();

  await new Promise(r => setTimeout(r, 50));

  // Should never go idle
  expect(events).not.toContain('idle');
});
