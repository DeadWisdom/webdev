/**
 * Tests for broadcast plugin
 * Note: Uses mocked BroadcastChannel for Node.js testing
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { localCollection } from '../../registry.ts';
import { memory } from '../storage/memory.ts';
import { broadcast } from './broadcast.ts';
import type { Doc } from '../../types.ts';

// Mock BroadcastChannel for testing
class MockBroadcastChannel extends EventTarget {
  static channels = new Map<string, MockBroadcastChannel[]>();
  
  name: string;
  onmessage: ((this: BroadcastChannel, ev: MessageEvent) => any) | null = null;
  
  constructor(name: string) {
    super();
    this.name = name;
    
    // Register this channel
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, []);
    }
    MockBroadcastChannel.channels.get(name)!.push(this);
  }
  
  postMessage(data: any) {
    // Send message to all other channels with same name
    const channels = MockBroadcastChannel.channels.get(this.name) || [];
    for (const channel of channels) {
      if (channel !== this) {
        setTimeout(() => {
          const event = new MessageEvent('message', { data });
          if (channel.onmessage) {
            channel.onmessage.call(channel, event);
          }
          channel.dispatchEvent(event);
        }, 0);
      }
    }
  }
  
  close() {
    const channels = MockBroadcastChannel.channels.get(this.name);
    if (channels) {
      const index = channels.indexOf(this);
      if (index !== -1) {
        channels.splice(index, 1);
      }
      if (channels.length === 0) {
        MockBroadcastChannel.channels.delete(this.name);
      }
    }
  }
  
  static clearAll() {
    MockBroadcastChannel.channels.clear();
  }
}

// Mock crypto.randomUUID for consistent testing
const mockUUIDs = ['tab1', 'tab2', 'tab3'];
let uuidIndex = 0;
const originalRandomUUID = crypto.randomUUID;

beforeAll(() => {
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;
  crypto.randomUUID = () => {
    const uuid = mockUUIDs[uuidIndex % mockUUIDs.length];
    uuidIndex++;
    return uuid;
  };
});

afterAll(() => {
  (globalThis as any).BroadcastChannel = undefined;
  crypto.randomUUID = originalRandomUUID;
  MockBroadcastChannel.clearAll();
  uuidIndex = 0;
});

test("broadcast plugin creates and manages channel", async () => {
  const collection = await localCollection('test_broadcast_1', 
    memory(),
    broadcast()
  );
  
  // Plugin should be installed without errors
  expect(collection.name).toBe('test_broadcast_1');
  
  await collection.close();
});

test("broadcast plugin with custom channel name", async () => {
  const collection = await localCollection('test_broadcast_2',
    memory(),
    broadcast({ channel: 'custom-channel' })
  );
  
  expect(collection.name).toBe('test_broadcast_2');
  await collection.close();
});

test("cross-tab sync - put operation", async () => {
  // Create two collections simulating two tabs
  const collection1 = await localCollection('sync_test_1',
    memory(),
    broadcast({ channel: 'test-sync' })
  );
  
  const collection2 = await localCollection('sync_test_2',
    memory(), 
    broadcast({ channel: 'test-sync' })
  );
  
  const events: any[] = [];
  collection2.addEventListener('change', (e) => {
    events.push((e as CustomEvent).detail);
  });
  
  // Add document to collection1
  const doc: Doc = { id: '1', name: 'Synced Item', value: 42 };
  await collection1.put(doc);
  
  // Wait for broadcast to propagate
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Check that collection2 received the change
  const syncedDoc = await collection2.get('1');
  expect(syncedDoc).toEqual(doc);
  
  // Check that change event was emitted with broadcast source
  expect(events).toHaveLength(1);
  expect(events[0].op).toBe('put');
  expect(events[0].source).toBe('broadcast');
  expect(events[0].doc).toEqual(doc);
  
  await collection1.close();
  await collection2.close();
});

test("cross-tab sync - delete operation", async () => {
  const collection1 = await localCollection('sync_test_3',
    memory(),
    broadcast({ channel: 'test-sync-delete' })
  );
  
  const collection2 = await localCollection('sync_test_4',
    memory(),
    broadcast({ channel: 'test-sync-delete' })
  );
  
  // Add document to both collections first
  const doc: Doc = { id: '2', name: 'To Delete' };
  await collection1.put(doc);
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Verify it synced
  expect(await collection2.get('2')).toEqual(doc);
  
  const events: any[] = [];
  collection2.addEventListener('change', (e) => {
    events.push((e as CustomEvent).detail);
  });
  
  // Delete from collection1
  await collection1.delete('2');
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Verify deletion synced
  expect(await collection2.get('2')).toBeUndefined();
  
  // Check delete event was emitted
  const deleteEvent = events.find(e => e.op === 'delete');
  expect(deleteEvent).toBeDefined();
  expect(deleteEvent.source).toBe('broadcast');
  expect(deleteEvent.id).toBe('2');
  
  await collection1.close();
  await collection2.close();
});

test("broadcast doesn't echo own changes", async () => {
  const collection = await localCollection('echo_test',
    memory(),
    broadcast()
  );
  
  const events: any[] = [];
  collection.addEventListener('change', (e) => {
    events.push((e as CustomEvent).detail);
  });
  
  // Add document
  await collection.put({ id: '1', name: 'Test' });
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Should only have one event (the original, not a broadcast echo)
  const localEvents = events.filter(e => e.source !== 'broadcast');
  expect(localEvents).toHaveLength(1);
  expect(localEvents[0].op).toBe('put');
  
  await collection.close();
});

test("remote flag prevents broadcast", async () => {
  const collection1 = await localCollection('remote_test_1',
    memory(),
    broadcast({ channel: 'remote-test' })
  );
  
  const collection2 = await localCollection('remote_test_2',
    memory(),
    broadcast({ channel: 'remote-test' })
  );
  
  const events: any[] = [];
  collection2.addEventListener('change', (e) => {
    events.push((e as CustomEvent).detail);
  });
  
  // Put with remote flag (simulating sync from another source)
  await collection1.put({ id: '1', name: 'Remote' }, { remote: true });
  
  // Wait for potential broadcast
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Should not have synced because remote flag prevents broadcast
  expect(await collection2.get('1')).toBeUndefined();
  expect(events).toHaveLength(0);
  
  await collection1.close();
  await collection2.close();
});

// Clean up
test("cleanup broadcast tests", async () => {
  await localCollection.close();
  MockBroadcastChannel.clearAll();
});