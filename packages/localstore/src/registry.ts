/**
 * Global registry and factory for collections
 */

import { Collection } from './collection.ts';
import type { Plugin, LocalCollectionAPI } from './types.ts';

// Global state
const registry = new Map<string, Collection>();
const globalEvents = new EventTarget();

// Shared queue will be initialized by sync plugins that need it
let sharedQueue: any = null;

/**
 * Create a new collection with plugins
 */
async function createCollection(name: string, ...plugins: Plugin[]): Promise<Collection> {
  if (registry.has(name)) {
    throw new Error(`Collection '${name}' already exists. Use localCollection.get('${name}') to retrieve it.`);
  }
  
  const collection = new Collection(name, plugins);
  
  // Install plugins
  await collection.installPlugins();
  
  // Bubble events to global
  collection.addEventListener('change', (e) => {
    globalEvents.dispatchEvent(new CustomEvent('change', { 
      detail: (e as CustomEvent).detail 
    }));
  });
  
  registry.set(name, collection);
  return collection;
}

// Create the main API
export const localCollection = createCollection as unknown as LocalCollectionAPI;

// Add static methods
localCollection.get = (name: string) => registry.get(name);

localCollection.all = () => new Map(registry);

localCollection.addEventListener = globalEvents.addEventListener.bind(globalEvents);

localCollection.removeEventListener = globalEvents.removeEventListener.bind(globalEvents);

// Network status tracking
localCollection.online = typeof navigator !== 'undefined' ? navigator.onLine : true;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { 
    localCollection.online = true;
    globalEvents.dispatchEvent(new CustomEvent('online', { 
      detail: { queueSize: sharedQueue?.size ?? 0 }
    }));
  });
  
  window.addEventListener('offline', () => { 
    localCollection.online = false;
    globalEvents.dispatchEvent(new CustomEvent('offline', { 
      detail: { queueSize: sharedQueue?.size ?? 0 }
    }));
  });
}

// Shared queue accessors (lazy initialized by first sync plugin)
Object.defineProperty(localCollection, 'queue', {
  get() {
    return {
      get size() { return sharedQueue?.size ?? 0; },
      get syncing() { return sharedQueue?.syncing ?? false; },
      get stalledSince() { return sharedQueue?.stalledSince ?? null; },
    };
  }
});

// Cleanup all collections
localCollection.close = async () => {
  for (const collection of registry.values()) {
    await collection.close();
  }
  registry.clear();
  sharedQueue?.destroy();
  sharedQueue = null;
};

// Export function to set shared queue (used by sync plugins)
export function setSharedQueue(queue: any): void {
  if (sharedQueue) {
    console.warn('Shared queue already initialized, replacing...');
    sharedQueue.destroy?.();
  }
  sharedQueue = queue;
}