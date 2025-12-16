/**
 * LocalStore - Plugin-based browser data layer
 */

// Core exports
export { localCollection } from './registry.ts';
export { Collection } from './collection.ts';
export { OfflineQueue, type QueueItem, type OfflineQueueOptions } from './plugins/queue.ts';

// Type exports
export type {
  Doc,
  Plugin,
  WriteOptions,
  SearchOptions,
  MethodName,
  ChangeEvent,
  Collection as CollectionType,
  LocalCollectionAPI
} from './types.ts';

// Storage plugins
export { memory } from './plugins/storage/memory.ts';
export { indexedDB } from './plugins/storage/indexeddb.ts';
// export { localStorage } from './plugins/storage/localstorage.ts';

// Search plugins
export { flexSearch } from './plugins/search/flexsearch.ts';

// Sync plugins
export { broadcast } from './plugins/sync/broadcast.ts';
export { httpSync } from './plugins/sync/http.ts';
export { firebaseSync } from './plugins/sync/firebase.ts';

// Transform plugins
export { timestamps } from './plugins/transform/timestamps.ts';
export { validate, commonSchemas, schemaBuilders, validationMiddleware } from './plugins/transform/validate.ts';

// Web Components - import separately in browser environments:
// import { LocalData, LocalQuery, LocalDebug } from 'localstore/components';