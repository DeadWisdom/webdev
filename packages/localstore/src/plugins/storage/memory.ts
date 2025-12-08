/**
 * Memory storage plugin - ephemeral in-memory storage
 */

import type { Plugin, Doc } from '../../types.ts';

export interface MemoryOptions {
  initialData?: Doc[];
}

export function memory(options: MemoryOptions = {}): Plugin {
  const store = new Map<string, Doc>();
  
  // Initialize with data if provided
  if (options.initialData) {
    for (const doc of options.initialData) {
      store.set(doc.id, doc);
    }
  }
  
  return {
    name: 'memory',
    
    async get(_next, id: string): Promise<Doc | undefined> {
      // Terminal plugin - doesn't call next
      return store.get(id);
    },
    
    async getAll(_next): Promise<Doc[]> {
      // Terminal plugin - doesn't call next
      return Array.from(store.values());
    },
    
    async put(_next, doc: Doc): Promise<void> {
      // Terminal plugin - doesn't call next
      if (!doc.id) {
        throw new Error('Document must have an id field');
      }
      store.set(doc.id, structuredClone(doc));
    },
    
    async delete(_next, id: string): Promise<void> {
      // Terminal plugin - doesn't call next
      store.delete(id);
    },
    
    async clear(_next): Promise<void> {
      // Terminal plugin - doesn't call next
      store.clear();
    },
    
    destroy(): void {
      store.clear();
    }
  };
}