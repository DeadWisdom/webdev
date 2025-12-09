/**
 * Tests for IndexedDB plugin
 * Note: Full IndexedDB tests require a browser environment
 */

import { test, expect } from "bun:test";
import { indexedDB } from './indexeddb.ts';

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

// Note: Full CRUD tests require a browser environment with IndexedDB support
// These tests would normally include:
// - Basic CRUD operations
// - Database versioning and migrations  
// - Error handling and retries
// - Connection management
// - Concurrent transaction handling
// 
// For integration testing, these should be run in a browser environment
// or with a proper IndexedDB polyfill like fake-indexeddb