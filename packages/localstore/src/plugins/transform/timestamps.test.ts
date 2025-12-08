/**
 * Tests for timestamps plugin
 */

import { test, expect } from "bun:test";
import { localCollection } from '../../registry.ts';
import { memory } from '../storage/memory.ts';
import { timestamps } from './timestamps.ts';
import type { Doc } from '../../types.ts';

test("timestamps plugin adds createdAt and updatedAt", async () => {
  const collection = await localCollection(
    'test_timestamps_1',
    timestamps(),
    memory()
  );
  
  const before = Date.now();
  await collection.put({ id: '1', name: 'Test' });
  const after = Date.now();
  
  const doc = await collection.get('1');
  expect(doc).toBeDefined();
  expect(doc!.createdAt).toBeGreaterThanOrEqual(before);
  expect(doc!.createdAt).toBeLessThanOrEqual(after);
  expect(doc!.updatedAt).toBeGreaterThanOrEqual(before);
  expect(doc!.updatedAt).toBeLessThanOrEqual(after);
});

test("timestamps preserves createdAt on update", async () => {
  const collection = await localCollection(
    'test_timestamps_2',
    timestamps(),
    memory()
  );
  
  await collection.put({ id: '1', name: 'Original' });
  const original = await collection.get('1');
  const originalCreatedAt = original!.createdAt;
  const originalUpdatedAt = original!.updatedAt;
  
  // Wait a bit to ensure different timestamp
  await new Promise(resolve => setTimeout(resolve, 10));
  
  await collection.put({ id: '1', name: 'Updated' });
  const updated = await collection.get('1');
  
  // createdAt should be preserved
  expect(updated!.createdAt).toBe(originalCreatedAt);
  // updatedAt should be new
  expect(updated!.updatedAt).toBeGreaterThan(originalUpdatedAt as number);
  // name should be updated
  expect(updated!.name).toBe('Updated');
});

test("timestamps with custom field names", async () => {
  const collection = await localCollection(
    'test_timestamps_3',
    timestamps({ created: 'created', updated: 'modified' }),
    memory()
  );
  
  await collection.put({ id: '1', name: 'Test' });
  const doc = await collection.get('1');
  
  expect(doc!.created).toBeDefined();
  expect(doc!.modified).toBeDefined();
  expect(doc!.createdAt).toBeUndefined();
  expect(doc!.updatedAt).toBeUndefined();
});

test("plugin order matters - timestamps before storage", async () => {
  const collection = await localCollection(
    'test_timestamps_4',
    timestamps(),
    memory()
  );
  
  await collection.put({ id: '1', value: 42 });
  const doc = await collection.get('1');
  
  // Should have timestamps because timestamps runs before memory storage
  expect(doc!.createdAt).toBeDefined();
  expect(doc!.updatedAt).toBeDefined();
});

// Clean up
test("cleanup timestamps tests", async () => {
  await localCollection.close();
});