/**
 * Tests for OfflineQueue
 */

import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { OfflineQueue, type QueueItem } from './queue.ts';

// Set up fake IndexedDB globally
beforeAll(() => {
  (globalThis as any).indexedDB = new IDBFactory();
  (globalThis as any).IDBKeyRange = IDBKeyRange;
  (globalThis as any).navigator = { onLine: true };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
});

afterAll(() => {
  (globalThis as any).indexedDB = undefined;
  (globalThis as any).IDBKeyRange = undefined;
  (globalThis as any).navigator = undefined;
  (globalThis as any).window = undefined;
});

// Reset IndexedDB between tests
beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
  (globalThis as any).navigator = { onLine: true };
});

// ========== Basic Queue Operations (Memory) ==========

test("queue creates with default options", () => {
  const queue = new OfflineQueue();
  expect(queue.size).toBe(0);
  expect(queue.syncing).toBe(false);
  expect(queue.isPaused).toBe(false);
  queue.destroy();
});

test("queue creates with custom options", () => {
  const queue = new OfflineQueue({
    maxRetries: 10,
    baseDelay: 500,
    maxDelay: 60000,
    storage: 'memory'
  });
  expect(queue.size).toBe(0);
  queue.destroy();
});

test("queue add item (memory)", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  const events: any[] = [];
  queue.addEventListener('queue:add', (e) => {
    events.push((e as CustomEvent).detail);
  });

  await queue.add('put', 'test-collection', { id: '1', name: 'Test' });

  expect(queue.size).toBe(1);
  expect(events).toHaveLength(1);
  expect(events[0].item.collection).toBe('test-collection');
  expect(events[0].item.operation).toBe('put');

  queue.destroy();
});

test("queue getItems returns all items", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  await queue.add('put', 'col1', { id: '1', name: 'Doc 1' });
  await queue.add('put', 'col2', { id: '2', name: 'Doc 2' });
  await queue.add('delete', 'col1', undefined, '3');

  const items = queue.getItems();
  expect(items).toHaveLength(3);

  queue.destroy();
});

test("queue getItem returns specific item", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  await queue.add('put', 'test', { id: '1', name: 'Test' });

  const items = queue.getItems();
  const item = queue.getItem(items[0].id);

  expect(item).toBeDefined();
  expect(item?.doc?.name).toBe('Test');

  queue.destroy();
});

test("queue removeItem removes specific item", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  await queue.add('put', 'test', { id: '1', name: 'Test' });

  const items = queue.getItems();
  const removed = await queue.removeItem(items[0].id);

  expect(removed).toBe(true);
  expect(queue.size).toBe(0);

  queue.destroy();
});

test("queue getItemsByCollection filters by collection", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  await queue.add('put', 'col1', { id: '1' });
  await queue.add('put', 'col1', { id: '2' });
  await queue.add('put', 'col2', { id: '3' });

  const col1Items = queue.getItemsByCollection('col1');
  const col2Items = queue.getItemsByCollection('col2');

  expect(col1Items).toHaveLength(2);
  expect(col2Items).toHaveLength(1);

  queue.destroy();
});

test("queue clear removes all items", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  await queue.add('put', 'test', { id: '1' });
  await queue.add('put', 'test', { id: '2' });

  expect(queue.size).toBe(2);

  await queue.clear();

  expect(queue.size).toBe(0);

  queue.destroy();
});

// ========== Pause/Resume ==========

test("queue pause stops processing", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  const events: string[] = [];
  queue.addEventListener('queue:pause', () => events.push('pause'));
  queue.addEventListener('queue:resume', () => events.push('resume'));

  queue.pause();
  expect(queue.isPaused).toBe(true);
  expect(events).toContain('pause');

  queue.resume();
  expect(queue.isPaused).toBe(false);
  expect(events).toContain('resume');

  queue.destroy();
});

test("queue does not process when paused", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  queue.pause();
  await queue.add('put', 'test', { id: '1' });

  // Item should stay in queue since paused
  expect(queue.size).toBe(1);

  queue.destroy();
});

// ========== Queue Processing ==========

test("queue processes items with handler", async () => {
  const queue = new OfflineQueue({
    storage: 'memory',
    autoProcess: false,
    maxRetries: 1
  });

  const processed: QueueItem[] = [];

  queue.addEventListener('queue:process', (e) => {
    const { item, resolve } = (e as CustomEvent).detail;
    processed.push(item);
    resolve();
  });

  await queue.add('put', 'test', { id: '1', name: 'Test' });

  // Manually trigger processing
  await queue.flush();

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(processed).toHaveLength(1);
  expect(queue.size).toBe(0);

  queue.destroy();
});

test("queue retries failed items", async () => {
  const queue = new OfflineQueue({
    storage: 'memory',
    autoProcess: false,
    maxRetries: 3,
    baseDelay: 10
  });

  let attempts = 0;

  queue.addEventListener('queue:process', (e) => {
    const { reject } = (e as CustomEvent).detail;
    attempts++;
    reject(new Error('Simulated failure'));
  });

  await queue.add('put', 'test', { id: '1' });
  await queue.flush();

  // Wait for retries
  await new Promise(resolve => setTimeout(resolve, 200));

  // Should have tried multiple times
  expect(attempts).toBeGreaterThanOrEqual(2);

  queue.destroy();
});

test("queue emits failed event after max retries", async () => {
  const queue = new OfflineQueue({
    storage: 'memory',
    autoProcess: false,
    maxRetries: 2,
    baseDelay: 10
  });

  const failedItems: QueueItem[] = [];

  queue.addEventListener('queue:process', (e) => {
    const { reject } = (e as CustomEvent).detail;
    reject(new Error('Permanent failure'));
  });

  queue.addEventListener('queue:failed', (e) => {
    failedItems.push((e as CustomEvent).detail.item);
  });

  await queue.add('put', 'test', { id: '1' });
  await queue.flush();

  // Wait for all retries to exhaust
  await new Promise(resolve => setTimeout(resolve, 300));

  expect(failedItems).toHaveLength(1);
  expect(queue.size).toBe(0); // Item removed after max retries

  queue.destroy();
});

test("queue emits drain event when empty", async () => {
  const queue = new OfflineQueue({
    storage: 'memory',
    autoProcess: false
  });

  let drained = false;
  queue.addEventListener('queue:drain', () => {
    drained = true;
  });

  queue.addEventListener('queue:process', (e) => {
    const { resolve } = (e as CustomEvent).detail;
    resolve();
  });

  await queue.add('put', 'test', { id: '1' });
  await queue.flush();

  await new Promise(resolve => setTimeout(resolve, 50));

  expect(drained).toBe(true);

  queue.destroy();
});

// ========== Retry Methods ==========

test("queue retryAll resets all attempts", async () => {
  const queue = new OfflineQueue({
    storage: 'memory',
    autoProcess: false,
    maxRetries: 5
  });

  // Add items and simulate some failures
  await queue.add('put', 'test', { id: '1' });
  await queue.add('put', 'test', { id: '2' });

  // Manually set attempts to simulate failures
  const items = queue.getItems();
  items[0].attempts = 3;
  items[1].attempts = 2;

  await queue.retryAll();

  const updatedItems = queue.getItems();
  expect(updatedItems[0].attempts).toBe(0);
  expect(updatedItems[1].attempts).toBe(0);

  queue.destroy();
});

test("queue retryItem resets specific item attempts", async () => {
  const queue = new OfflineQueue({
    storage: 'memory',
    autoProcess: false
  });

  await queue.add('put', 'test', { id: '1' });

  const items = queue.getItems();
  items[0].attempts = 3;
  items[0].lastError = 'Previous error';

  const result = await queue.retryItem(items[0].id);

  expect(result).toBe(true);
  expect(items[0].attempts).toBe(0);
  expect(items[0].lastError).toBeUndefined();

  queue.destroy();
});

test("queue retryItem returns false for non-existent item", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  const result = await queue.retryItem('non-existent-id');
  expect(result).toBe(false);

  queue.destroy();
});

// ========== Statistics ==========

test("queue getStats returns correct statistics", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  // Pause to prevent auto-processing
  queue.pause();

  await queue.add('put', 'users', { id: '1' });
  await queue.add('put', 'users', { id: '2' });
  await queue.add('delete', 'posts', undefined, '3');
  await queue.add('put', 'posts', { id: '4' });

  // Simulate a failed item
  const items = queue.getItems();
  items[0].attempts = 1;

  const stats = queue.getStats();

  expect(stats.size).toBe(4);
  expect(stats.syncing).toBe(false);
  expect(stats.paused).toBe(true);
  expect(stats.online).toBe(true);
  expect(stats.byCollection.users).toBe(2);
  expect(stats.byCollection.posts).toBe(2);
  expect(stats.byOperation.put).toBe(3);
  expect(stats.byOperation.delete).toBe(1);
  expect(stats.failedCount).toBe(1);

  queue.destroy();
});

// ========== IndexedDB Persistence ==========

test("queue with IndexedDB storage persists items", async () => {
  const queue = new OfflineQueue({
    storage: 'indexeddb',
    dbName: 'test-queue-db',
    autoProcess: false
  });

  await queue.init();

  await queue.add('put', 'test', { id: '1', name: 'Persisted Doc' });

  expect(queue.size).toBe(1);

  queue.destroy();
});

test("queue with IndexedDB loads persisted items on init", async () => {
  const dbName = 'test-persist-db';

  // First queue - add items
  const queue1 = new OfflineQueue({
    storage: 'indexeddb',
    dbName,
    autoProcess: false
  });

  await queue1.init();
  await queue1.add('put', 'test', { id: '1', name: 'Doc 1' });
  await queue1.add('put', 'test', { id: '2', name: 'Doc 2' });

  expect(queue1.size).toBe(2);

  // Don't destroy - just close to simulate page refresh
  queue1.destroy();

  // Second queue - should load persisted items
  const queue2 = new OfflineQueue({
    storage: 'indexeddb',
    dbName,
    autoProcess: false
  });

  await queue2.init();

  expect(queue2.size).toBe(2);

  const items = queue2.getItems();
  expect(items.some(i => i.doc?.name === 'Doc 1')).toBe(true);
  expect(items.some(i => i.doc?.name === 'Doc 2')).toBe(true);

  queue2.destroy();
});

test("queue with IndexedDB removes items after successful processing", async () => {
  const queue = new OfflineQueue({
    storage: 'indexeddb',
    dbName: 'test-remove-db',
    autoProcess: false
  });

  await queue.init();

  queue.addEventListener('queue:process', (e) => {
    const { resolve } = (e as CustomEvent).detail;
    resolve();
  });

  await queue.add('put', 'test', { id: '1' });
  expect(queue.size).toBe(1);

  await queue.flush();
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(queue.size).toBe(0);

  queue.destroy();
});

test("queue with IndexedDB clear removes all persisted items", async () => {
  const queue = new OfflineQueue({
    storage: 'indexeddb',
    dbName: 'test-clear-db',
    autoProcess: false
  });

  await queue.init();

  await queue.add('put', 'test', { id: '1' });
  await queue.add('put', 'test', { id: '2' });

  expect(queue.size).toBe(2);

  await queue.clear();

  expect(queue.size).toBe(0);

  queue.destroy();
});

// ========== Online/Offline Behavior ==========

test("queue isOnline reflects navigator.onLine", () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  (globalThis as any).navigator.onLine = true;
  expect(queue.isOnline).toBe(true);

  (globalThis as any).navigator.onLine = false;
  expect(queue.isOnline).toBe(false);

  queue.destroy();
});

test("queue does not auto-process when offline", async () => {
  (globalThis as any).navigator.onLine = false;

  const queue = new OfflineQueue({
    storage: 'memory',
    autoProcess: true
  });

  let processAttempts = 0;
  queue.addEventListener('queue:process', () => {
    processAttempts++;
  });

  await queue.add('put', 'test', { id: '1' });

  await new Promise(resolve => setTimeout(resolve, 50));

  // Should not have attempted to process
  expect(processAttempts).toBe(0);
  expect(queue.size).toBe(1);

  queue.destroy();
});

// ========== Edge Cases ==========

test("queue handles destroyed state", async () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  queue.destroy();

  // Should not throw, just no-op
  await queue.add('put', 'test', { id: '1' });

  expect(queue.size).toBe(0);
});

test("queue stalledSince returns null when empty", () => {
  const queue = new OfflineQueue({ storage: 'memory', autoProcess: false });

  expect(queue.stalledSince).toBeNull();

  queue.destroy();
});

test("queue emits ready event on init", async () => {
  const queue = new OfflineQueue({
    storage: 'indexeddb',
    dbName: 'test-ready-db',
    autoProcess: false
  });

  let ready = false;
  queue.addEventListener('queue:ready', () => {
    ready = true;
  });

  await queue.init();

  expect(ready).toBe(true);

  queue.destroy();
});

test("queue flush ignores pause state temporarily", async () => {
  const queue = new OfflineQueue({
    storage: 'memory',
    autoProcess: false
  });

  const processed: string[] = [];

  queue.addEventListener('queue:process', (e) => {
    const { item, resolve } = (e as CustomEvent).detail;
    processed.push(item.id);
    resolve();
  });

  await queue.add('put', 'test', { id: '1' });

  queue.pause();
  expect(queue.isPaused).toBe(true);

  await queue.flush();
  await new Promise(resolve => setTimeout(resolve, 50));

  // Should have processed despite being paused
  expect(processed).toHaveLength(1);

  // Should still be paused after flush
  expect(queue.isPaused).toBe(true);

  queue.destroy();
});

// ========== Cleanup ==========

test("cleanup queue tests", () => {
  // Just a marker test for cleanup
  expect(true).toBe(true);
});
