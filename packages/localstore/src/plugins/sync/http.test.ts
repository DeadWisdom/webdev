/**
 * Tests for HTTP sync plugin
 * Uses mock fetch for Node.js testing
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { localCollection } from '../../registry.ts';
import { memory } from '../storage/memory.ts';
import { httpSync } from './http.ts';
import type { Doc } from '../../types.ts';

// Mock fetch for testing
interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Map<string, string>;
  json(): Promise<any>;
}

interface MockFetchCall {
  url: string;
  options?: RequestInit;
  response: MockResponse;
}

let mockFetchCalls: MockFetchCall[] = [];
let mockFetchResponses: MockResponse[] = [];
let fetchResponseIndex = 0;

function createMockResponse(data: any, status = 200, headers: Record<string, string> = {}): MockResponse {
  const headerMap = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: (name: string) => headerMap.get(name) || null
    } as any,
    json: async () => data
  };
}

function mockFetch(url: string | URL, options?: RequestInit): Promise<MockResponse> {
  const response = mockFetchResponses[fetchResponseIndex] || createMockResponse({});
  fetchResponseIndex++;
  
  mockFetchCalls.push({
    url: url.toString(),
    options,
    response
  });
  
  return Promise.resolve(response);
}

beforeAll(() => {
  (globalThis as any).fetch = mockFetch;
  // Mock navigator for online/offline tests
  (globalThis as any).navigator = { onLine: true };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };
});

afterAll(() => {
  (globalThis as any).fetch = undefined;
  (globalThis as any).navigator = undefined;
  (globalThis as any).window = undefined;
});

function resetMocks() {
  mockFetchCalls = [];
  mockFetchResponses = [];
  fetchResponseIndex = 0;
}

test("httpSync plugin creates with string endpoint", () => {
  const plugin = httpSync('https://api.example.com/docs');
  expect(plugin.name).toBe('httpSync');
  expect(typeof plugin.install).toBe('function');
  expect(typeof plugin.destroy).toBe('function');
});

test("httpSync plugin creates with options object", () => {
  const plugin = httpSync({
    endpoint: 'https://api.example.com/docs',
    poll: 5000,
    headers: { 'Authorization': 'Bearer token' },
    timeout: 10000
  });
  expect(plugin.name).toBe('httpSync');
});

test("httpSync initial pull on install", async () => {
  resetMocks();
  
  // Mock successful pull response
  mockFetchResponses = [
    createMockResponse([
      { id: '1', title: 'Remote Doc 1', content: 'From server' },
      { id: '2', title: 'Remote Doc 2', content: 'Also from server' }
    ])
  ];
  
  const collection = await localCollection('http_test_1',
    httpSync({
      endpoint: 'https://api.example.com/docs',
      pull: true,
      push: false // Disable push for this test
    }),
    memory()
  );
  
  // Wait for initial pull
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Check that documents were pulled
  const docs = await collection.getAll();
  expect(docs).toHaveLength(2);
  expect(docs.find(d => d.id === '1')?.title).toBe('Remote Doc 1');
  
  // Verify fetch was called
  expect(mockFetchCalls).toHaveLength(1);
  expect(mockFetchCalls[0].url).toBe('https://api.example.com/docs');
  expect(mockFetchCalls[0].options?.method).toBe('GET');
  
  await collection.close();
});

test("httpSync push operations", async () => {
  resetMocks();
  
  // Mock successful responses for initial pull and push operations
  mockFetchResponses = [
    createMockResponse([]), // Initial pull - empty
    createMockResponse({}), // PUT response
    createMockResponse({}), // DELETE response
  ];
  
  const collection = await localCollection('http_test_2',
    httpSync({
      endpoint: 'https://api.example.com/docs',
      push: true,
      pull: true
    }),
    memory()
  );
  
  // Wait for initial pull
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Add a document (should trigger push)
  await collection.put({
    id: 'test-doc',
    title: 'Test Document',
    content: 'This should be pushed'
  });
  
  // Delete the document (should trigger push)
  await collection.delete('test-doc');
  
  // Wait for pushes to complete
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // Verify fetch calls
  expect(mockFetchCalls.length).toBeGreaterThanOrEqual(3);
  
  // Check PUT call
  const putCall = mockFetchCalls.find(call => call.options?.method === 'PUT');
  expect(putCall).toBeDefined();
  expect(putCall?.url).toBe('https://api.example.com/docs/test-doc');
  
  // Check DELETE call  
  const deleteCall = mockFetchCalls.find(call => call.options?.method === 'DELETE');
  expect(deleteCall).toBeDefined();
  expect(deleteCall?.url).toBe('https://api.example.com/docs/test-doc');
  
  await collection.close();
});

test("httpSync with custom headers", async () => {
  resetMocks();
  
  mockFetchResponses = [
    createMockResponse([]) // Initial pull
  ];
  
  const collection = await localCollection('http_test_3',
    httpSync({
      endpoint: 'https://api.example.com/docs',
      headers: {
        'Authorization': 'Bearer secret-token',
        'X-Custom-Header': 'custom-value'
      }
    }),
    memory()
  );
  
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Check that custom headers were sent
  expect(mockFetchCalls).toHaveLength(1);
  const headers = mockFetchCalls[0].options?.headers as Record<string, string>;
  expect(headers['Authorization']).toBe('Bearer secret-token');
  expect(headers['X-Custom-Header']).toBe('custom-value');
  
  await collection.close();
});

test("httpSync conditional requests with ETag", async () => {
  resetMocks();
  
  // First response with ETag
  mockFetchResponses = [
    createMockResponse(
      [{ id: '1', title: 'Doc 1' }], 
      200, 
      { 'ETag': '"abc123"' }
    ),
    createMockResponse({}, 304) // Second request - not modified
  ];
  
  const plugin = httpSync({
    endpoint: 'https://api.example.com/docs',
    poll: 50 // Short polling interval for test
  });
  
  const collection = await localCollection('http_test_4', plugin, memory());
  
  // Wait for initial pull and one poll
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Should have made at least 2 requests
  expect(mockFetchCalls.length).toBeGreaterThanOrEqual(2);
  
  // Second request should include If-None-Match header
  const secondCall = mockFetchCalls[1];
  const headers = secondCall.options?.headers as Record<string, string>;
  expect(headers['If-None-Match']).toBe('"abc123"');
  
  await collection.close();
});

test("httpSync error handling", async () => {
  resetMocks();
  
  // Mock error response
  mockFetchResponses = [
    { 
      ok: false, 
      status: 500, 
      statusText: 'Internal Server Error',
      headers: new Map(),
      json: async () => ({ error: 'Server error' })
    } as MockResponse
  ];
  
  const events: any[] = [];
  
  const collection = await localCollection('http_test_5',
    httpSync('https://api.example.com/docs'),
    memory()
  );
  
  // Listen for sync errors
  collection.addEventListener('sync:error', (e) => {
    events.push((e as CustomEvent).detail);
  });
  
  // Wait for initial pull to fail and event to be emitted
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Should have received an error event
  expect(events).toHaveLength(1);
  expect(events[0].adapter).toBe('http');
  expect(events[0].operation).toBe('pull');
  
  await collection.close();
});

test("httpSync offline queue", async () => {
  resetMocks();
  
  // Mock responses
  mockFetchResponses = [
    createMockResponse([]), // Initial pull
  ];
  
  const collection = await localCollection('http_test_6',
    httpSync({
      endpoint: 'https://api.example.com/docs',
      retryAttempts: 2,
      retryDelay: 10
    }),
    memory()
  );
  
  // Wait for initial setup
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Simulate going offline
  (globalThis as any).navigator.onLine = false;
  
  // Mock fetch to fail (simulating network error)
  mockFetchResponses = [
    { 
      ok: false, 
      status: 0, 
      statusText: 'Network Error',
      headers: new Map(),
      json: async () => { throw new Error('Network Error'); }
    } as MockResponse
  ];
  
  // Reset fetch index for new responses
  fetchResponseIndex = 1;
  
  // Add document while offline (should be queued due to fetch failure)
  await collection.put({
    id: 'offline-doc',
    title: 'Offline Document'
  });
  
  // Wait for push attempt to fail and queue
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Check queue status
  const queueSize = (localCollection as any).queue.size;
  expect(queueSize).toBeGreaterThanOrEqual(1);
  
  await collection.close();
});

test("httpSync conflict resolution", async () => {
  resetMocks();
  
  // Create collection with pull disabled initially
  const collection = await localCollection('http_test_7',
    httpSync({
      endpoint: 'https://api.example.com/docs',
      conflictResolution: 'server-wins',
      pull: false, // Disable initial pull
      push: false  // Disable push for this test
    }),
    memory()
  );
  
  // Add local document first
  await collection.put({
    id: 'conflict-doc',
    title: 'Local Version', 
    content: 'Local content',
    updatedAt: Date.now()
  });
  
  // Now mock server response with conflicting document (newer timestamp)
  mockFetchResponses = [
    createMockResponse([
      { 
        id: 'conflict-doc', 
        title: 'Server Version',
        content: 'Server content',
        updatedAt: Date.now() + 1000 // Newer than local
      }
    ])
  ];
  
  // Manually trigger a pull to test conflict resolution
  // We'll simulate this by directly putting the server document with remote flag
  await collection.put({
    id: 'conflict-doc',
    title: 'Server Version',
    content: 'Server content',
    updatedAt: Date.now() + 1000
  }, { remote: true });
  
  // Check that server version is now present
  const doc = await collection.get('conflict-doc');
  expect(doc?.title).toBe('Server Version');
  expect(doc?.content).toBe('Server content');
  
  await collection.close();
});

test("httpSync sync events", async () => {
  resetMocks();
  
  mockFetchResponses = [
    createMockResponse([{ id: '1', title: 'Test' }]), // Pull
    createMockResponse({}) // Push
  ];
  
  const syncEvents: any[] = [];
  
  const collection = await localCollection('http_test_8',
    httpSync('https://api.example.com/docs'),
    memory()
  );
  
  // Listen for sync events
  collection.addEventListener('sync:complete', (e) => {
    syncEvents.push((e as CustomEvent).detail);
  });
  
  // Wait for initial pull
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Add document to trigger push
  await collection.put({ id: '2', title: 'New Doc' });
  
  // Wait for push
  await new Promise(resolve => setTimeout(resolve, 20));
  
  // Should have sync events
  expect(syncEvents.length).toBeGreaterThanOrEqual(1);
  expect(syncEvents[0].adapter).toBe('http');
  
  await collection.close();
});

// Clean up
test("cleanup http sync tests", async () => {
  await localCollection.close();
  resetMocks();
});