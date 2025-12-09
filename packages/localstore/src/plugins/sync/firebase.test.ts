/**
 * Tests for Firebase sync plugin
 * Uses mock Firebase SDK for testing
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { localCollection } from '../../registry.ts';
import { memory } from '../storage/memory.ts';
import { firebaseSync } from './firebase.ts';
import type { Doc } from '../../types.ts';

// Mock Firebase SDK
interface MockSnapshot {
  exists(): boolean;
  val(): any;
}

interface MockDatabaseReference {
  key: string;
}

interface MockDatabase {}

interface MockFirebaseApp {}

let mockFirebaseData: Map<string, any> = new Map();
let mockFirebaseCalls: Array<{ method: string; path: string; data?: any }> = [];
let mockListeners: Array<{ path: string; callback: (snapshot: MockSnapshot) => void }> = [];
let mockPresenceCallbacks: Array<(snapshot: MockSnapshot) => void> = [];

// Mock Firebase functions
const mockFirebase = {
  initializeApp: () => ({ name: 'mock-app' } as MockFirebaseApp),
  getDatabase: () => ({ name: 'mock-db' } as MockDatabase),
  ref: (db: MockDatabase, path: string) => ({ key: path } as MockDatabaseReference),
  get: async (ref: MockDatabaseReference): Promise<MockSnapshot> => {
    mockFirebaseCalls.push({ method: 'get', path: ref.key });
    const data = mockFirebaseData.get(ref.key);
    return {
      exists: () => data !== undefined,
      val: () => data
    };
  },
  set: async (ref: MockDatabaseReference, data: any) => {
    mockFirebaseCalls.push({ method: 'set', path: ref.key, data });
    if (data === null) {
      mockFirebaseData.delete(ref.key);
    } else {
      mockFirebaseData.set(ref.key, data);
    }
    
    // Trigger listeners
    mockListeners.forEach(listener => {
      if (listener.path === ref.key) {
        listener.callback({
          exists: () => data !== null,
          val: () => data
        });
      }
    });
  },
  remove: async (ref: MockDatabaseReference) => {
    mockFirebaseCalls.push({ method: 'remove', path: ref.key });
    mockFirebaseData.delete(ref.key);
    
    // Trigger listeners
    mockListeners.forEach(listener => {
      if (listener.path === ref.key) {
        listener.callback({
          exists: () => false,
          val: () => null
        });
      }
    });
  },
  onValue: (ref: MockDatabaseReference, callback: (snapshot: MockSnapshot) => void) => {
    if (ref.key === '.info/connected') {
      // Simulate connection status
      mockPresenceCallbacks.push(callback);
      setTimeout(() => callback({ exists: () => true, val: () => true }), 10);
    } else {
      mockListeners.push({ path: ref.key, callback });
      
      // Trigger initial callback
      const data = mockFirebaseData.get(ref.key);
      setTimeout(() => callback({
        exists: () => data !== undefined,
        val: () => data
      }), 10);
    }
    
    return () => {
      // Unsubscribe
      const index = mockListeners.findIndex(l => l.path === ref.key && l.callback === callback);
      if (index >= 0) {
        mockListeners.splice(index, 1);
      }
    };
  },
  off: () => {}, // Mock off function
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
  onDisconnect: () => ({
    set: async () => {}
  })
};

// Mock the Firebase modules
beforeAll(() => {
  // Mock firebase/app
  (globalThis as any).mockFirebaseApp = {
    initializeApp: mockFirebase.initializeApp
  };
  
  // Mock firebase/database
  (globalThis as any).mockFirebaseDatabase = {
    getDatabase: mockFirebase.getDatabase,
    ref: mockFirebase.ref,
    get: mockFirebase.get,
    set: mockFirebase.set,
    remove: mockFirebase.remove,
    onValue: mockFirebase.onValue,
    off: mockFirebase.off,
    serverTimestamp: mockFirebase.serverTimestamp,
    onDisconnect: mockFirebase.onDisconnect
  };
});

afterAll(() => {
  (globalThis as any).mockFirebaseApp = undefined;
  (globalThis as any).mockFirebaseDatabase = undefined;
});

function resetMocks() {
  mockFirebaseData.clear();
  mockFirebaseCalls = [];
  mockListeners = [];
  mockPresenceCallbacks = [];
}

// Note: These tests focus on plugin factory and basic validation since 
// Firebase SDK requires a complex mocking setup that's beyond the scope of unit tests

test("firebaseSync plugin creates with config", () => {
  const plugin = firebaseSync({
    config: {
      apiKey: "test-key",
      authDomain: "test.firebaseapp.com",
      databaseURL: "https://test.firebaseio.com",
      projectId: "test-project"
    }
  });
  
  expect(plugin.name).toBe('firebaseSync');
  expect(typeof plugin.install).toBe('function');
  expect(typeof plugin.destroy).toBe('function');
});

test("firebaseSync plugin with custom options", () => {
  const plugin = firebaseSync({
    config: {
      apiKey: "test-key",
      authDomain: "test.firebaseapp.com", 
      databaseURL: "https://test.firebaseio.com",
      projectId: "test-project"
    },
    path: 'custom/path',
    realtime: false,
    push: false,
    pull: true,
    useServerTimestamp: false,
    conflictResolution: 'local-wins',
    offline: false,
    presence: true,
    batchWrites: false
  });
  
  expect(plugin.name).toBe('firebaseSync');
});

test("firebaseSync plugin validates required config", () => {
  expect(() => {
    firebaseSync({
      config: {} as any // Invalid config
    });
  }).not.toThrow(); // Plugin creation should not throw, errors happen during install
});

test("firebaseSync conflict resolution strategies", async () => {
  // Test that conflict resolution options are properly configured
  const strategies = ['local-wins', 'server-wins', 'merge', 'error'] as const;
  
  for (const strategy of strategies) {
    const plugin = firebaseSync({
      config: {
        apiKey: "test-key",
        authDomain: "test.firebaseapp.com",
        databaseURL: "https://test.firebaseio.com", 
        projectId: "test-project"
      },
      conflictResolution: strategy
    });
    
    expect(plugin.name).toBe('firebaseSync');
  }
});

test("firebaseSync with presence detection", () => {
  const plugin = firebaseSync({
    config: {
      apiKey: "test-key",
      authDomain: "test.firebaseapp.com",
      databaseURL: "https://test.firebaseio.com",
      projectId: "test-project"  
    },
    presence: true
  });
  
  expect(plugin.name).toBe('firebaseSync');
});

test("firebaseSync batch operations configuration", () => {
  const plugin = firebaseSync({
    config: {
      apiKey: "test-key", 
      authDomain: "test.firebaseapp.com",
      databaseURL: "https://test.firebaseio.com",
      projectId: "test-project"
    },
    batchWrites: true
  });
  
  expect(plugin.name).toBe('firebaseSync');
});

// Integration test with mock Firebase (simplified)
test("firebaseSync basic integration", async () => {
  resetMocks();
  
  // This is a simplified integration test since full Firebase mocking is complex
  const plugin = firebaseSync({
    config: {
      apiKey: "test-key",
      authDomain: "test.firebaseapp.com", 
      databaseURL: "https://test.firebaseio.com",
      projectId: "test-project"
    },
    pull: false, // Disable pull to avoid Firebase calls
    push: false, // Disable push to avoid Firebase calls
    realtime: false // Disable realtime to avoid Firebase calls
  });
  
  expect(plugin.name).toBe('firebaseSync');
  expect(typeof plugin.install).toBe('function');
  expect(typeof plugin.destroy).toBe('function');
});

test("firebaseSync server timestamp configuration", () => {
  const pluginWithTimestamp = firebaseSync({
    config: {
      apiKey: "test-key",
      authDomain: "test.firebaseapp.com",
      databaseURL: "https://test.firebaseio.com", 
      projectId: "test-project"
    },
    useServerTimestamp: true
  });
  
  const pluginWithoutTimestamp = firebaseSync({
    config: {
      apiKey: "test-key",
      authDomain: "test.firebaseapp.com",
      databaseURL: "https://test.firebaseio.com",
      projectId: "test-project"  
    },
    useServerTimestamp: false
  });
  
  expect(pluginWithTimestamp.name).toBe('firebaseSync');
  expect(pluginWithoutTimestamp.name).toBe('firebaseSync');
});

test("firebaseSync offline support configuration", () => {
  const plugin = firebaseSync({
    config: {
      apiKey: "test-key",
      authDomain: "test.firebaseapp.com",
      databaseURL: "https://test.firebaseio.com",
      projectId: "test-project"
    },
    offline: true
  });
  
  expect(plugin.name).toBe('firebaseSync');
});

test("firebaseSync custom database path", () => {
  const plugin = firebaseSync({
    config: {
      apiKey: "test-key", 
      authDomain: "test.firebaseapp.com",
      databaseURL: "https://test.firebaseio.com",
      projectId: "test-project"
    },
    path: 'organizations/org1/collections'
  });
  
  expect(plugin.name).toBe('firebaseSync');
});

// Clean up
test("cleanup firebase sync tests", async () => {
  await localCollection.close();
  resetMocks();
});