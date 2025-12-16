/**
 * Core exports only - no plugins
 */
export { localCollection } from './registry.ts';
export { Collection } from './collection.ts';
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
