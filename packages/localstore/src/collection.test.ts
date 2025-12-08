/**
 * Tests for Collection class and basic functionality
 */

import { test, expect } from "bun:test";
import { localCollection, memory } from './index.ts';
import type { Doc } from './types.ts';

test("create collection with memory plugin", async () => {
  const collection = await localCollection('test1', memory());
  expect(collection.name).toBe('test1');
});

test("basic CRUD operations", async () => {
  const collection = await localCollection('test2', memory());
  
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
});

test("clear operation", async () => {
  const collection = await localCollection('test3', memory());
  
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
});

test("change events", async () => {
  const collection = await localCollection('test4', memory());
  const events: any[] = [];
  
  collection.addEventListener('change', (e) => {
    events.push((e as CustomEvent).detail);
  });
  
  // Put event
  await collection.put({ id: '1', name: 'Test' });
  expect(events).toHaveLength(1);
  expect(events[0].op).toBe('put');
  expect(events[0].id).toBe('1');
  expect(events[0].collection).toBe('test4');
  
  // Delete event
  await collection.delete('1');
  expect(events).toHaveLength(2);
  expect(events[1].op).toBe('delete');
  expect(events[1].id).toBe('1');
  
  // Clear event
  await collection.clear();
  expect(events).toHaveLength(3);
  expect(events[2].op).toBe('clear');
});

test("subscribe method", async () => {
  const collection = await localCollection('test5', memory());
  const snapshots: Doc[][] = [];
  
  // Subscribe
  const unsubscribe = collection.subscribe((docs) => {
    snapshots.push([...docs]);
  });
  
  // Initial call should give empty array
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0]).toHaveLength(0);
  
  // Add document
  await collection.put({ id: '1', name: 'Test' });
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(snapshots).toHaveLength(2);
  expect(snapshots[1]).toHaveLength(1);
  
  // Unsubscribe
  unsubscribe();
  
  // Further changes shouldn't trigger
  await collection.put({ id: '2', name: 'Test 2' });
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(snapshots).toHaveLength(2); // No new snapshots
});

test("remote flag prevents events", async () => {
  const collection = await localCollection('test6', memory());
  const events: any[] = [];
  
  collection.addEventListener('change', (e) => {
    events.push((e as CustomEvent).detail);
  });
  
  // Put with remote flag
  await collection.put({ id: '1', name: 'Remote' }, { remote: true });
  expect(events).toHaveLength(0);
  
  // Delete with remote flag
  await collection.delete('1', { remote: true });
  expect(events).toHaveLength(0);
  
  // Normal put should emit
  await collection.put({ id: '2', name: 'Local' });
  expect(events).toHaveLength(1);
});

test("global event listener", async () => {
  const events: any[] = [];
  
  localCollection.addEventListener('change', (e) => {
    events.push((e as CustomEvent).detail);
  });
  
  const collection = await localCollection('test7', memory());
  
  await collection.put({ id: '1', name: 'Test' });
  expect(events).toHaveLength(1);
  expect(events[0].collection).toBe('test7');
  
  localCollection.removeEventListener('change', () => {});
});

test("collection registry", async () => {
  const col1 = await localCollection('registry1', memory());
  const col2 = await localCollection('registry2', memory());
  
  // Get by name
  expect(localCollection.get('registry1')).toBe(col1);
  expect(localCollection.get('registry2')).toBe(col2);
  expect(localCollection.get('nonexistent')).toBeUndefined();
  
  // Get all
  const all = localCollection.all();
  expect(all.get('registry1')).toBe(col1);
  expect(all.get('registry2')).toBe(col2);
});

test("duplicate collection name throws", async () => {
  await localCollection('duplicate', memory());
  
  try {
    await localCollection('duplicate', memory());
    expect(true).toBe(false); // Should not reach
  } catch (err) {
    expect((err as Error).message).toContain("already exists");
  }
});

test("missing method throws appropriate error", async () => {
  const collection = await localCollection('test_no_search', memory());
  
  try {
    await collection.search('test');
    expect(true).toBe(false); // Should not reach
  } catch (err) {
    expect((err as Error).message).toContain("No plugin provides 'search'");
  }
});

// Clean up after all tests
test("cleanup", async () => {
  await localCollection.close();
  const all = localCollection.all();
  expect(all.size).toBe(0);
});