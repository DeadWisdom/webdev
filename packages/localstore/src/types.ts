/**
 * Core types for LocalStore
 */

export interface Doc {
  id: string;
  [key: string]: unknown;
}

export interface WriteOptions {
  remote?: boolean; // True if change came from sync (don't echo back)
  validateRemote?: boolean; // True to validate remote changes
}

export interface SearchOptions {
  limit?: number;
  fields?: string[];
}

export type NextFn<T = any> = (...args: any[]) => Promise<T>;

export interface Plugin {
  name: string;
  
  // Lifecycle
  install?: (collection: Collection) => void | Promise<void>;
  destroy?: () => void | Promise<void>;
  
  // Data methods - all middleware-style
  // Skipped if not implemented by this plugin
  get?: (next: NextFn<Doc | undefined>, id: string) => Promise<Doc | undefined>;
  getAll?: (next: NextFn<Doc[]>) => Promise<Doc[]>;
  put?: (next: NextFn<void>, doc: Doc, opts?: WriteOptions) => Promise<void>;
  delete?: (next: NextFn<void>, id: string, opts?: WriteOptions) => Promise<void>;
  clear?: (next: NextFn<void>) => Promise<void>;
  search?: (next: NextFn<Doc[]>, query: string, opts?: SearchOptions) => Promise<Doc[]>;
}

export type MethodName = 'get' | 'getAll' | 'put' | 'delete' | 'clear' | 'search';

export interface ChangeEvent extends Event {
  detail: {
    collection: string;
    op: 'put' | 'delete' | 'clear';
    id?: string;
    doc?: Doc;
    timestamp: number;
    source?: string;
    remote?: boolean;
  };
}

export interface Collection extends EventTarget {
  name: string;
  get(id: string): Promise<Doc | undefined>;
  getAll(): Promise<Doc[]>;
  put(doc: Doc, opts?: WriteOptions): Promise<void>;
  delete(id: string, opts?: WriteOptions): Promise<void>;
  clear(): Promise<void>;
  search(query: string, opts?: SearchOptions): Promise<Doc[]>;
  subscribe(callback: (docs: Doc[]) => void): () => void;
  close(): Promise<void>;
}

export interface LocalCollectionAPI {
  (name: string, ...plugins: Plugin[]): Promise<Collection>;
  get(name: string): Collection | undefined;
  all(): Map<string, Collection>;
  addEventListener: EventTarget['addEventListener'];
  removeEventListener: EventTarget['removeEventListener'];
  close(): Promise<void>;
  online: boolean;
  queue: {
    readonly size: number;
    readonly syncing: boolean;
    readonly stalledSince: Date | null;
  };
}