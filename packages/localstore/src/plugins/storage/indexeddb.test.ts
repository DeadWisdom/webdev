/**
 * Tests for IndexedDB plugin using fake-indexeddb
 */

import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { indexedDB } from './indexeddb.ts';
import { localCollection } from '../../registry.ts';
import type { Doc } from '../../types.ts';

// Set up fake IndexedDB globally before tests
beforeAll(() => {
  (globalThis as any).indexedDB = new IDBFactory();
  (globalThis as any).IDBKeyRange = IDBKeyRange;
});

afterAll(async () => {
  await localCollection.close();
  (globalThis as any).indexedDB = undefined;
  (globalThis as any).IDBKeyRange = undefined;
});

// Reset IndexedDB between tests to avoid conflicts
beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
});

test("indexedDB plugin factory creates plugin", () => {
  const plugin = indexedDB();
  expect(plugin.name).toBe('indexedDB');
  expect(typeof plugin.install).toBe('function');
  expect(typeof plugin.get).toBe('function');
  expect(typeof plugin.getAll).toBe('function');
  expect(typeof plugin.put).toBe('function');
  expect(typeof plugin.delete).toBe('function');
  expect(typeof plugin.clear).toBe('function');
  expect(typeof plugin.destroy).toBe('function');
});

test("indexedDB plugin with custom options", () => {
  const plugin = indexedDB({
    database: 'custom-db',
    version: 2,
    retryAttempts: 5,
    retryDelay: 200
  });
  expect(plugin.name).toBe('indexedDB');
});

test("indexedDB basic CRUD operations", async () => {
  const collection = await localCollection('idb_crud_test', indexedDB());

  // Put a document
  const doc: Doc = { id: '1', name: 'Test Item', value: 42 };
  await collection.put(doc);

  // Get the document
  const retrieved = await collection.get('1');
  expect(retrieved).toEqual(doc);

  // Get all documents
  const all = await collection.getAll();
  expect(all).toHaveLength(1);
  expect(all[0]).toEqual(doc);

  // Update the document
  const updated = { ...doc, value: 100 };
  await collection.put(updated);
  const retrievedAfterUpdate = await collection.get('1');
  expect(retrievedAfterUpdate?.value).toBe(100);

  // Delete the document
  await collection.delete('1');
  const retrievedAfterDelete = await collection.get('1');
  expect(retrievedAfterDelete).toBeUndefined();

  // Verify getAll is empty
  const allAfterDelete = await collection.getAll();
  expect(allAfterDelete).toHaveLength(0);

  await collection.close();
});

test("indexedDB clear operation", async () => {
  const collection = await localCollection('idb_clear_test', indexedDB());

  // Add multiple documents
  await collection.put({ id: '1', name: 'Item 1' });
  await collection.put({ id: '2', name: 'Item 2' });
  await collection.put({ id: '3', name: 'Item 3' });

  // Verify they exist
  const all = await collection.getAll();
  expect(all).toHaveLength(3);

  // Clear all
  await collection.clear();

  // Verify empty
  const allAfterClear = await collection.getAll();
  expect(allAfterClear).toHaveLength(0);

  await collection.close();
});

test("indexedDB persists data across plugin instances", async () => {
  const dbName = 'persist_test_db';
  const storeName = 'idb_persist_test';

  // First instance - write data
  const collection1 = await localCollection(storeName, indexedDB({ database: dbName }));
  await collection1.put({ id: 'persist1', data: 'should persist' });
  await collection1.close();

  // Clear the registry so we can create a new collection with the same name
  await localCollection.close();

  // Second instance - read data back
  const collection2 = await localCollection(storeName, indexedDB({ database: dbName }));
  const doc = await collection2.get('persist1');
  expect(doc).toEqual({ id: 'persist1', data: 'should persist' });

  await collection2.close();
});

test("indexedDB handles multiple collections in same database", async () => {
  const dbName = 'multi_collection_db';

  const collection1 = await localCollection('store_a', indexedDB({ database: dbName }));
  const collection2 = await localCollection('store_b', indexedDB({ database: dbName }));

  // Add different data to each
  await collection1.put({ id: '1', source: 'store_a' });
  await collection2.put({ id: '1', source: 'store_b' });

  // Verify data is isolated
  const doc1 = await collection1.get('1');
  const doc2 = await collection2.get('1');

  expect(doc1?.source).toBe('store_a');
  expect(doc2?.source).toBe('store_b');

  await collection1.close();
  await collection2.close();
});

test("indexedDB handles complex document structures", async () => {
  const collection = await localCollection('idb_complex_test', indexedDB());

  const complexDoc: Doc = {
    id: 'complex1',
    name: 'Complex Document',
    nested: {
      level1: {
        level2: {
          value: 'deeply nested'
        }
      }
    },
    array: [1, 2, 3, { nested: true }],
    date: new Date('2024-01-01').toISOString(),
    nullValue: null,
    boolTrue: true,
    boolFalse: false,
    number: 42.5
  };

  await collection.put(complexDoc);
  const retrieved = await collection.get('complex1');

  expect(retrieved).toEqual(complexDoc);
  expect(retrieved?.nested?.level1?.level2?.value).toBe('deeply nested');
  expect(retrieved?.array).toHaveLength(4);

  await collection.close();
});

test("indexedDB handles concurrent operations", async () => {
  const collection = await localCollection('idb_concurrent_test', indexedDB());

  // Perform multiple operations concurrently
  const operations = [
    collection.put({ id: '1', value: 1 }),
    collection.put({ id: '2', value: 2 }),
    collection.put({ id: '3', value: 3 }),
    collection.put({ id: '4', value: 4 }),
    collection.put({ id: '5', value: 5 }),
  ];

  await Promise.all(operations);

  // Verify all documents exist
  const all = await collection.getAll();
  expect(all).toHaveLength(5);

  // Concurrent reads
  const reads = await Promise.all([
    collection.get('1'),
    collection.get('2'),
    collection.get('3'),
    collection.get('4'),
    collection.get('5'),
  ]);

  expect(reads.every(doc => doc !== undefined)).toBe(true);
  expect(reads.map(d => d?.value)).toEqual([1, 2, 3, 4, 5]);

  await collection.close();
});

test("indexedDB get returns undefined for non-existent document", async () => {
  const collection = await localCollection('idb_nonexistent_test', indexedDB());

  const doc = await collection.get('does-not-exist');
  expect(doc).toBeUndefined();

  await collection.close();
});

test("indexedDB delete on non-existent document succeeds silently", async () => {
  const collection = await localCollection('idb_delete_nonexistent_test', indexedDB());

  // Should not throw
  await collection.delete('does-not-exist');

  // Verify collection is still functional
  await collection.put({ id: '1', name: 'test' });
  const doc = await collection.get('1');
  expect(doc?.name).toBe('test');

  await collection.close();
});

test("indexedDB with custom database name", async () => {
  const collection = await localCollection('idb_custom_db_test',
    indexedDB({ database: 'my-custom-database' })
  );

  await collection.put({ id: '1', name: 'test' });
  const doc = await collection.get('1');
  expect(doc?.name).toBe('test');

  await collection.close();
});

// Clean up all collections
test("cleanup indexedDB tests", async () => {
  await localCollection.close();
});
