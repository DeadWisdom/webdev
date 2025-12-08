/**
 * Timestamps plugin - adds automatic created/updated timestamps
 */

import type { Plugin, Doc, WriteOptions, NextFn, Collection } from '../../types.ts';

export interface TimestampsOptions {
  created?: string;
  updated?: string;
}

export function timestamps(options: TimestampsOptions = {}): Plugin {
  const createdField = options.created ?? 'createdAt';
  const updatedField = options.updated ?? 'updatedAt';
  let collection: Collection;
  
  return {
    name: 'timestamps',
    
    install(col: Collection) {
      collection = col;
    },
    
    async put(next: NextFn<void>, doc: Doc, opts?: WriteOptions): Promise<void> {
      // Try to get existing document to preserve createdAt
      let existing: Doc | undefined;
      try {
        existing = await collection.get(doc.id);
      } catch {
        // Document might not exist, that's ok
      }
      
      // Add timestamps
      const timestampedDoc = {
        ...doc,
        [createdField]: existing?.[createdField] ?? Date.now(),
        [updatedField]: Date.now(),
      };
      
      // Pass to next plugin in chain
      await next(timestampedDoc, opts);
    },
  };
}