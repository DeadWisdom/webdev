# LocalStore: Plugin-Based Browser Data Layer

A minimal, composable approach to browser data with persistence, sync, and search.

## API Overview

```typescript
import { 
  localCollection,
  indexedDB,
  flexSearch,
  firebaseSync,
  timestamps,
} from 'localstore';

// Create a collection with plugins
const products = await localCollection('products',
  indexedDB(),
  flexSearch(['name', 'description']),
  firebaseSync('products'),
  timestamps(),
);

// Use it
await products.put({ id: '1', name: 'Widget', price: 29 });
const doc = await products.get('1');
const all = await products.getAll();
const found = await products.search('widg');
await products.delete('1');

// Subscribe to changes
const off = products.subscribe(docs => render(docs));

// Collection is an EventTarget
products.addEventListener('change', (e) => {
  console.log(e.detail.op, e.detail.doc);
});
```

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      Application                           │
├────────────────────────────────────────────────────────────┤
│  products.put()    products.search()    <local-query>      │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│                      Collection                            │
│  name: 'products'                                          │
│  extends EventTarget                                       │
├────────────────────────────────────────────────────────────┤
│  Methods:  get | getAll | put | delete | clear | search    │
│  Each method chains through plugins that implement it      │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│                    Plugin Chain                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  put() chain:                                              │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐         │
│  │ timestamps │ → │  encrypt   │ → │ indexedDB  │ (terminal)
│  └────────────┘   └────────────┘   └────────────┘         │
│                                                            │
│  search() chain:                                           │
│  ┌────────────┐                                           │
│  │ flexSearch │ (terminal)                                │
│  └────────────┘                                           │
│                                                            │
│  (plugins without method are skipped)                      │
│                                                            │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│                  Event-Driven Plugins                      │
├────────────────────────────────────────────────────────────┤
│  firebaseSync    httpSync    broadcast                     │
│  (listen to 'change' events, no method chain)              │
└────────────────────────────────────────────────────────────┘
```

## Plugin Interface

```typescript
interface Plugin {
  name: string;
  
  // Lifecycle
  install?: (collection: Collection) => void | Promise<void>;
  destroy?: () => void;
  
  // Data methods - all middleware-style
  // Skipped if not implemented by this plugin
  get?: (next: NextFn, id: string) => Promise<Doc | undefined>;
  getAll?: (next: NextFn) => Promise<Doc[]>;
  put?: (next: NextFn, doc: Doc, opts?: WriteOptions) => Promise<void>;
  delete?: (next: NextFn, id: string, opts?: WriteOptions) => Promise<void>;
  clear?: (next: NextFn) => Promise<void>;
  search?: (next: NextFn, query: string, opts?: SearchOptions) => Promise<Doc[]>;
}

interface WriteOptions {
  remote?: boolean;  // True if change came from sync (don't echo back)
}

interface SearchOptions {
  limit?: number;
  fields?: string[];
}

type NextFn = (...args: any[]) => Promise<any>;
```

## Collection Implementation

```typescript
type MethodName = 'get' | 'getAll' | 'put' | 'delete' | 'clear' | 'search';

class Collection extends EventTarget {
  name: string;
  private plugins: Plugin[];
  private chains: Map<MethodName, Function>;
  
  constructor(name: string, plugins: Plugin[]) {
    super();
    this.name = name;
    this.plugins = plugins;
    this.chains = this.buildChains();
  }
  
  private buildChains(): Map<MethodName, Function> {
    const methods: MethodName[] = ['get', 'getAll', 'put', 'delete', 'clear', 'search'];
    const chains = new Map();
    
    for (const method of methods) {
      // Get plugins that implement this method, in order
      const handlers = this.plugins
        .filter(p => typeof p[method] === 'function')
        .map(p => p[method]!.bind(p));
      
      if (handlers.length === 0) {
        chains.set(method, () => {
          throw new Error(`No plugin provides '${method}'`);
        });
        continue;
      }
      
      // Build chain: each handler calls next to continue
      const chain = handlers.reduceRight(
        (next, handler) => (...args: any[]) => handler(next, ...args),
        () => { throw new Error(`Unexpected end of chain for '${method}'`); }
      );
      
      chains.set(method, chain);
    }
    
    return chains;
  }
  
  async get(id: string): Promise<Doc | undefined> {
    return this.chains.get('get')!(id);
  }
  
  async getAll(): Promise<Doc[]> {
    return this.chains.get('getAll')!();
  }
  
  async put(doc: Doc, opts?: WriteOptions): Promise<void> {
    await this.chains.get('put')!(doc, opts);
    
    if (!opts?.remote) {
      this.dispatchEvent(new CustomEvent('change', {
        detail: { 
          collection: this.name,
          op: 'put', 
          id: doc.id, 
          doc,
          timestamp: Date.now(),
        }
      }));
    }
  }
  
  async delete(id: string, opts?: WriteOptions): Promise<void> {
    await this.chains.get('delete')!(id, opts);
    
    if (!opts?.remote) {
      this.dispatchEvent(new CustomEvent('change', {
        detail: { 
          collection: this.name,
          op: 'delete', 
          id,
          timestamp: Date.now(),
        }
      }));
    }
  }
  
  async clear(): Promise<void> {
    await this.chains.get('clear')!();
    this.dispatchEvent(new CustomEvent('change', {
      detail: { collection: this.name, op: 'clear', timestamp: Date.now() }
    }));
  }
  
  async search(query: string, opts?: SearchOptions): Promise<Doc[]> {
    return this.chains.get('search')!(query, opts);
  }
  
  subscribe(callback: (docs: Doc[]) => void): () => void {
    const handler = () => this.getAll().then(callback);
    this.addEventListener('change', handler);
    handler(); // Initial call
    return () => this.removeEventListener('change', handler);
  }
  
  async close(): Promise<void> {
    for (const plugin of this.plugins) {
      await plugin.destroy?.();
    }
    registry.delete(this.name);
  }
}
```

## Global Registry

```typescript
const registry = new Map<string, Collection>();
const globalEvents = new EventTarget();
let sharedQueue: OfflineQueue | null = null;

async function localCollection(name: string, ...plugins: Plugin[]): Promise<Collection> {
  if (registry.has(name)) {
    throw new Error(`Collection '${name}' already exists`);
  }
  
  const collection = new Collection(name, plugins);
  
  // Install plugins
  for (const plugin of plugins) {
    await plugin.install?.(collection);
  }
  
  // Bubble events to global
  collection.addEventListener('change', (e) => {
    globalEvents.dispatchEvent(new CustomEvent('change', { detail: e.detail }));
  });
  
  registry.set(name, collection);
  return collection;
}

// Global accessors
localCollection.get = (name: string) => registry.get(name);
localCollection.all = () => new Map(registry);
localCollection.addEventListener = globalEvents.addEventListener.bind(globalEvents);
localCollection.removeEventListener = globalEvents.removeEventListener.bind(globalEvents);

// Shared queue (lazy initialized by first sync plugin)
localCollection.queue = {
  get size() { return sharedQueue?.size ?? 0; },
  get syncing() { return sharedQueue?.syncing ?? false; },
  get stalledSince() { return sharedQueue?.stalledSince ?? null; },
};

localCollection.online = navigator.onLine;
window.addEventListener('online', () => { localCollection.online = true; });
window.addEventListener('offline', () => { localCollection.online = false; });

// Cleanup all
localCollection.close = async () => {
  for (const col of registry.values()) {
    await col.close();
  }
  sharedQueue?.destroy();
};
```

## Core Plugins

### Storage: indexedDB()

Terminal plugin. Must be first in chain.

```typescript
interface IndexedDBOptions {
  database?: string;  // Default: 'localstore'
}

function indexedDB(opts: IndexedDBOptions = {}): Plugin {
  const dbName = opts.database ?? 'localstore';
  let db: IDBDatabase;
  let storeName: string;
  
  return {
    name: 'indexedDB',
    
    async install(collection) {
      storeName = collection.name;
      db = await openDatabase(dbName, storeName);
    },
    
    async get(next, id) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    
    async getAll(next) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    
    async put(next, doc) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).put(doc);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    
    async delete(next, id) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    
    async clear(next) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    
    destroy() {
      db?.close();
    }
  };
}

async function openDatabase(dbName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    
    req.onerror = () => reject(req.error);
    
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    };
    
    req.onsuccess = () => {
      const db = req.result;
      // Check if store exists, if not, bump version
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        const version = db.version + 1;
        const req2 = indexedDB.open(dbName, version);
        req2.onupgradeneeded = () => {
          req2.result.createObjectStore(storeName, { keyPath: 'id' });
        };
        req2.onsuccess = () => resolve(req2.result);
        req2.onerror = () => reject(req2.error);
      } else {
        resolve(db);
      }
    };
  });
}
```

### Storage: memory()

For testing or ephemeral data.

```typescript
function memory(): Plugin {
  const store = new Map<string, Doc>();
  
  return {
    name: 'memory',
    
    async get(next, id) {
      return store.get(id);
    },
    
    async getAll(next) {
      return Array.from(store.values());
    },
    
    async put(next, doc) {
      store.set(doc.id, doc);
    },
    
    async delete(next, id) {
      store.delete(id);
    },
    
    async clear(next) {
      store.clear();
    },
  };
}
```

### Search: flexSearch()

Terminal for search method.

```typescript
import FlexSearch from 'flexsearch';

interface FlexSearchOptions {
  fields: string[];
  tokenize?: 'strict' | 'forward' | 'reverse' | 'full';
}

function flexSearch(opts: string[] | FlexSearchOptions): Plugin {
  const config = Array.isArray(opts) ? { fields: opts } : opts;
  let index: FlexSearch.Document<Doc>;
  let collection: Collection;
  
  return {
    name: 'flexSearch',
    
    async install(col) {
      collection = col;
      
      index = new FlexSearch.Document({
        document: {
          id: 'id',
          index: config.fields,
        },
        tokenize: config.tokenize ?? 'forward',
      });
      
      // Index existing docs
      const docs = await col.getAll();
      for (const doc of docs) {
        index.add(doc);
      }
      
      // Keep index in sync
      col.addEventListener('change', (e: CustomEvent) => {
        const { op, id, doc } = e.detail;
        if (op === 'delete') {
          index.remove(id);
        } else if (op === 'put') {
          index.remove(id);  // Update = remove + add
          index.add(doc);
        } else if (op === 'clear') {
          // Rebuild empty index
          index = new FlexSearch.Document({
            document: { id: 'id', index: config.fields },
            tokenize: config.tokenize ?? 'forward',
          });
        }
      });
    },
    
    async search(next, query, opts) {
      const results = index.search(query, opts?.limit ?? 100);
      
      // FlexSearch returns { field, result: ids[] }[]
      // Flatten and dedupe
      const ids = [...new Set(results.flatMap(r => r.result))];
      
      // Fetch full docs
      const docs = await Promise.all(ids.map(id => collection.get(id as string)));
      return docs.filter(Boolean) as Doc[];
    },
  };
}
```

### Transform: timestamps()

Middleware that wraps put.

```typescript
interface TimestampsOptions {
  created?: string;
  updated?: string;
}

function timestamps(opts: TimestampsOptions = {}): Plugin {
  const createdField = opts.created ?? 'createdAt';
  const updatedField = opts.updated ?? 'updatedAt';
  let collection: Collection;
  
  return {
    name: 'timestamps',
    
    install(col) {
      collection = col;
    },
    
    async put(next, doc, opts) {
      const existing = await collection.get(doc.id);
      await next({
        ...doc,
        [createdField]: existing?.[createdField] ?? Date.now(),
        [updatedField]: Date.now(),
      }, opts);
    },
  };
}
```

### Transform: validate()

```typescript
function validate(schema: ZodSchema): Plugin {
  return {
    name: 'validate',
    
    async put(next, doc, opts) {
      const result = schema.safeParse(doc);
      if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`);
      }
      await next(result.data, opts);
    },
  };
}
```

### Sync: broadcast()

Cross-tab sync via BroadcastChannel. Event-driven, no chain methods.

```typescript
function broadcast(): Plugin {
  let channel: BroadcastChannel;
  let collection: Collection;
  const tabId = crypto.randomUUID();
  
  return {
    name: 'broadcast',
    
    install(col) {
      collection = col;
      channel = new BroadcastChannel(`localstore:${col.name}`);
      
      // Local changes → other tabs
      col.addEventListener('change', (e: CustomEvent) => {
        const detail = e.detail;
        if (detail.source === 'broadcast') return;  // Don't echo
        channel.postMessage({ ...detail, tabId });
      });
      
      // Other tabs → local
      channel.onmessage = async (e) => {
        if (e.data.tabId === tabId) return;  // Our own message
        
        const { op, id, doc } = e.data;
        if (op === 'put') {
          await collection.put(doc, { remote: true });
        } else if (op === 'delete') {
          await collection.delete(id, { remote: true });
        } else if (op === 'clear') {
          await collection.clear();
        }
        
        // Emit event so subscribers update
        collection.dispatchEvent(new CustomEvent('change', {
          detail: { ...e.data, source: 'broadcast' }
        }));
      };
    },
    
    destroy() {
      channel?.close();
    },
  };
}
```

### Sync: firebaseSync()

```typescript
import { ref, onValue, set, remove, getDatabase } from 'firebase/database';

interface FirebaseSyncOptions {
  path?: string;
  conflict?: 'local-wins' | 'server-wins' | 'merge';
  filter?: (doc: Doc) => boolean;
}

function firebaseSync(opts: string | FirebaseSyncOptions): Plugin {
  const config = typeof opts === 'string' ? { path: opts } : opts;
  const conflict = config.conflict ?? 'server-wins';
  const filter = config.filter ?? (() => true);
  
  let collection: Collection;
  let unsubscribe: () => void;
  let db: any;
  
  return {
    name: 'firebaseSync',
    
    install(col) {
      collection = col;
      db = getDatabase();
      const path = config.path ?? col.name;
      const dbRef = ref(db, path);
      
      // Remote → local
      unsubscribe = onValue(dbRef, async (snapshot) => {
        const data = snapshot.val() || {};
        
        for (const [id, doc] of Object.entries(data)) {
          const local = await collection.get(id);
          
          if (!local || conflict === 'server-wins') {
            await collection.put(doc as Doc, { remote: true });
          } else if (conflict === 'merge' && local) {
            await collection.put({ ...local, ...(doc as Doc) }, { remote: true });
          }
          // local-wins: do nothing
        }
      });
      
      // Local → remote
      col.addEventListener('change', async (e: CustomEvent) => {
        const { op, id, doc } = e.detail;
        if (e.detail.remote) return;  // Don't echo
        
        if (op === 'put' && filter(doc)) {
          await set(ref(db, `${path}/${id}`), doc);
        } else if (op === 'delete') {
          await remove(ref(db, `${path}/${id}`));
        }
      });
    },
    
    destroy() {
      unsubscribe?.();
    },
  };
}
```

### Sync: httpSync()

```typescript
interface HttpSyncOptions {
  endpoint: string;
  poll?: number;         // Polling interval in ms, 0 = disabled
  headers?: Record<string, string>;
  push?: boolean;        // Push changes to server (default: true)
}

function httpSync(opts: string | HttpSyncOptions): Plugin {
  const config = typeof opts === 'string' 
    ? { endpoint: opts, poll: 0, push: true } 
    : { poll: 0, push: true, ...opts };
  
  let collection: Collection;
  let pollInterval: number | null = null;
  
  return {
    name: 'httpSync',
    
    async install(col) {
      collection = col;
      
      // Initial fetch
      await pull();
      
      // Polling
      if (config.poll > 0) {
        pollInterval = window.setInterval(pull, config.poll);
      }
      
      // Push changes
      if (config.push) {
        col.addEventListener('change', async (e: CustomEvent) => {
          if (e.detail.remote) return;
          const { op, id, doc } = e.detail;
          
          try {
            if (op === 'put') {
              await fetch(`${config.endpoint}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...config.headers },
                body: JSON.stringify(doc),
              });
            } else if (op === 'delete') {
              await fetch(`${config.endpoint}/${id}`, {
                method: 'DELETE',
                headers: config.headers,
              });
            }
          } catch (err) {
            // Queue for retry (uses shared queue)
            localCollection.queue.add({ collection: col.name, op, id, doc });
          }
        });
      }
    },
    
    destroy() {
      if (pollInterval) clearInterval(pollInterval);
    },
  };
  
  async function pull() {
    try {
      const res = await fetch(config.endpoint, { headers: config.headers });
      const docs = await res.json();
      
      for (const doc of docs) {
        await collection.put(doc, { remote: true });
      }
    } catch (err) {
      collection.dispatchEvent(new CustomEvent('sync:error', {
        detail: { error: err, adapter: 'http' }
      }));
    }
  }
}
```

## Event Types

Collections and `localCollection` emit these events:

**Core Events**

| Event | When | detail |
|-------|------|--------|
| `change` | Document put/deleted/cleared | `{ collection, op, id?, doc?, timestamp }` |

**Sync Events**

| Event | When | detail |
|-------|------|--------|
| `sync:start` | Sync operation begins | `{ collection, adapter }` |
| `sync:complete` | Sync succeeds | `{ collection, adapter, count }` |
| `sync:error` | Sync fails | `{ collection, adapter, error }` |
| `sync:conflict` | Conflict detected | `{ collection, id, local, remote, resolution }` |

**Queue Events** (on `localCollection` only)

| Event | When | detail |
|-------|------|--------|
| `queue:add` | Operation queued | `{ collection, id, op, queueSize }` |
| `queue:flush` | Queue processing starts | `{ queueSize }` |
| `queue:drain` | Queue empty | `{}` |
| `queue:stalled` | Queue stuck | `{ queueSize, oldestAge, lastError }` |

**Connection Events** (on `localCollection` only)

| Event | When | detail |
|-------|------|--------|
| `online` | Network restored | `{ queueSize }` |
| `offline` | Network lost | `{ queueSize }` |

## Web Components

### `<local-data>` - Ingest from DOM

```html
<!-- From JSON -->
<local-data collection="config" key="id">
  <script type="application/json">
    {"id": "theme", "mode": "dark"}
  </script>
</local-data>

<!-- From JSON-LD -->
<local-data collection="products" key="@id">
  <script type="application/ld+json">
    {"@context": "https://schema.org", "@type": "Product", "@id": "p1", "name": "Widget"}
  </script>
</local-data>

<!-- From itemscope (with mutation observer) -->
<local-data collection="products" key="sku" observe>
  <div itemscope itemtype="https://schema.org/Product">
    <meta itemprop="sku" content="WIDGET-001">
    <span itemprop="name">Super Widget</span>
  </div>
</local-data>
```

```typescript
class LocalData extends HTMLElement {
  static observedAttributes = ['collection', 'key', 'observe'];
  
  private observer: MutationObserver | null = null;
  
  connectedCallback() {
    this.sync();
    
    if (this.hasAttribute('observe')) {
      this.observer = new MutationObserver(() => this.sync());
      this.observer.observe(this, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
      });
    }
  }
  
  disconnectedCallback() {
    this.observer?.disconnect();
  }
  
  private async sync() {
    const data = this.extractData();
    if (!data) return;
    
    const colName = this.getAttribute('collection')!;
    const collection = localCollection.get(colName);
    if (!collection) {
      console.warn(`<local-data>: Collection '${colName}' not found`);
      return;
    }
    
    const keyField = this.getAttribute('key') || 'id';
    const items = Array.isArray(data) ? data : [data];
    
    for (const item of items) {
      const id = item[keyField];
      if (id) {
        await collection.put({ ...item, id });
      }
    }
  }
  
  private extractData(): unknown {
    // Try JSON script
    const script = this.querySelector(
      'script[type="application/json"], script[type="application/ld+json"]'
    );
    if (script) {
      try {
        return JSON.parse(script.textContent || '');
      } catch { return null; }
    }
    
    // Try itemscope
    const itemscope = this.querySelector('[itemscope]');
    if (itemscope) {
      return this.parseItemscope(itemscope as HTMLElement);
    }
    
    return null;
  }
  
  private parseItemscope(el: HTMLElement): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    const props = el.querySelectorAll('[itemprop]');
    for (const prop of props) {
      if (prop.closest('[itemscope]') !== el) continue;  // Skip nested
      
      const name = prop.getAttribute('itemprop')!;
      const value = prop.hasAttribute('itemscope')
        ? this.parseItemscope(prop as HTMLElement)
        : this.getPropValue(prop as HTMLElement);
      
      result[name] = value;
    }
    
    return result;
  }
  
  private getPropValue(el: HTMLElement): string {
    if (el instanceof HTMLMetaElement) return el.content;
    if (el instanceof HTMLAnchorElement) return el.href;
    if (el instanceof HTMLImageElement) return el.src;
    if (el instanceof HTMLTimeElement) return el.dateTime || el.textContent || '';
    return el.textContent?.trim() || '';
  }
}

customElements.define('local-data', LocalData);
```

### `<local-query>` - Render from Data

```html
<local-query collection="products" filter="price < 50" sort="name" limit="10">
  <template>
    <div class="product">
      <h3>{{name}}</h3>
      <p>${{price}}</p>
    </div>
  </template>
</local-query>
```

```typescript
class LocalQuery extends HTMLElement {
  static observedAttributes = ['collection', 'filter', 'sort', 'limit', 'search'];
  
  private unsubscribe: (() => void) | null = null;
  private template: HTMLTemplateElement | null = null;
  
  connectedCallback() {
    this.template = this.querySelector('template');
    this.subscribe();
  }
  
  disconnectedCallback() {
    this.unsubscribe?.();
  }
  
  attributeChangedCallback() {
    this.subscribe();
  }
  
  private subscribe() {
    this.unsubscribe?.();
    
    const colName = this.getAttribute('collection')!;
    const collection = localCollection.get(colName);
    if (!collection) return;
    
    this.unsubscribe = collection.subscribe(async (docs) => {
      let results = docs;
      
      // Search
      const searchTerm = this.getAttribute('search');
      if (searchTerm) {
        results = await collection.search(searchTerm);
      }
      
      // Filter
      const filter = this.getAttribute('filter');
      if (filter) {
        results = results.filter(doc => this.evalFilter(doc, filter));
      }
      
      // Sort
      const sort = this.getAttribute('sort');
      if (sort) {
        const [field, dir = 'asc'] = sort.split(':');
        results = [...results].sort((a, b) => {
          const cmp = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
          return dir === 'desc' ? -cmp : cmp;
        });
      }
      
      // Limit
      const limit = parseInt(this.getAttribute('limit') || '0', 10);
      if (limit > 0) results = results.slice(0, limit);
      
      this.render(results);
    });
  }
  
  private render(items: Doc[]) {
    // Remove old rendered content
    for (const child of Array.from(this.children)) {
      if (child !== this.template) child.remove();
    }
    
    if (!this.template) return;
    
    for (const item of items) {
      const clone = this.template.content.cloneNode(true) as DocumentFragment;
      this.interpolate(clone, item);
      this.appendChild(clone);
    }
  }
  
  private interpolate(node: Node, data: Record<string, unknown>) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      walker.currentNode.textContent = (walker.currentNode.textContent || '')
        .replace(/\{\{(\w+)\}\}/g, (_, key) => String(data[key] ?? ''));
    }
  }
  
  private evalFilter(doc: Doc, expr: string): boolean {
    const match = expr.match(/(\w+)\s*(===?|!==?|<=?|>=?|<|>)\s*(.+)/);
    if (!match) return true;
    const [, field, op, rawVal] = match;
    const val = this.parseValue(rawVal.trim());
    const docVal = doc[field];
    
    switch (op) {
      case '==': case '===': return docVal === val;
      case '!=': case '!==': return docVal !== val;
      case '<': return docVal < val;
      case '<=': return docVal <= val;
      case '>': return docVal > val;
      case '>=': return docVal >= val;
    }
    return true;
  }
  
  private parseValue(v: string): unknown {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
    return v.replace(/^['"]|['"]$/g, '');
  }
}

customElements.define('local-query', LocalQuery);
```

### `<local-debug>` - Debug Panel

A floating panel for browsing all collections, searching, and live editing.

```html
<local-debug></local-debug>
```

(Implementation same as before - floating panel with collection tabs, document list, JSON editor)

## Usage Example

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import { 
      localCollection, 
      indexedDB, 
      flexSearch, 
      firebaseSync, 
      broadcast,
      timestamps,
    } from 'localstore';
    
    // Products: full featured
    await localCollection('products',
      indexedDB(),
      broadcast(),
      flexSearch(['name', 'description']),
      firebaseSync({ path: 'products', conflict: 'merge' }),
      timestamps(),
    );
    
    // User settings: local only
    await localCollection('settings',
      indexedDB(),
      broadcast(),
    );
    
    // Session data: ephemeral
    await localCollection('session',
      memory(),
    );
    
    // Listen globally
    localCollection.addEventListener('change', (e) => {
      console.log(`[${e.detail.collection}] ${e.detail.op}:`, e.detail.id);
    });
  </script>
</head>
<body>
  <!-- Load config from page -->
  <local-data collection="settings" key="id">
    <script type="application/json">
      {"id": "theme", "mode": "dark", "accent": "#4cc9f0"}
    </script>
  </local-data>
  
  <!-- Product listing -->
  <input type="search" id="search" placeholder="Search products...">
  
  <local-query collection="products" filter="price < 100" sort="name">
    <template>
      <div class="product">
        <h3>{{name}}</h3>
        <p>${{price}}</p>
      </div>
    </template>
  </local-query>
  
  <!-- Debug panel -->
  <local-debug></local-debug>
  
  <script>
    // Search on input
    document.getElementById('search').addEventListener('input', (e) => {
      document.querySelector('local-query').setAttribute('search', e.target.value);
    });
    
    // Programmatic usage
    const products = localCollection.get('products');
    await products.put({ id: '1', name: 'Widget', price: 29.99 });
  </script>
</body>
</html>
```

## File Structure

```
localstore/
├── src/
│   ├── index.ts              # Exports
│   ├── collection.ts         # Collection class
│   ├── registry.ts           # Global registry + localCollection function
│   ├── plugins/
│   │   ├── storage/
│   │   │   ├── indexeddb.ts
│   │   │   ├── localstorage.ts
│   │   │   └── memory.ts
│   │   ├── search/
│   │   │   └── flexsearch.ts
│   │   ├── sync/
│   │   │   ├── broadcast.ts
│   │   │   ├── firebase.ts
│   │   │   └── http.ts
│   │   ├── transform/
│   │   │   ├── timestamps.ts
│   │   │   └── validate.ts
│   │   └── queue.ts          # Shared offline queue
│   └── components/
│       ├── local-data.ts
│       ├── local-query.ts
│       └── local-debug.ts
├── package.json
└── tsconfig.json
```

## Bundle Sizes (estimated)

| Import | Size (gzipped) |
|--------|----------------|
| Core + indexedDB | ~3KB |
| + broadcast | ~4KB |
| + flexSearch | ~8KB |
| + firebaseSync | +Firebase SDK |
| + httpSync | ~5KB |
| + web components | ~7KB |
| Full bundle | ~12KB + Firebase |
