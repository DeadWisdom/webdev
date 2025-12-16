# LocalStore

A minimal, composable plugin-based browser data layer with persistence, sync, and search.

## Features

- **Plugin Architecture**: Compose functionality through middleware chains
- **Multiple Storage Backends**: IndexedDB, localStorage, memory
- **Full-Text Search**: Built-in FlexSearch integration
- **Real-Time Sync**: Firebase, HTTP, and cross-tab broadcast sync
- **Web Components**: Declarative data binding in HTML
- **TypeScript First**: Full type safety
- **Lightweight**: ~3KB core, pay for what you use

## Installation

```bash
# Core package (no dependencies)
npm install localstore

# With optional features
npm install localstore flexsearch    # For full-text search
npm install localstore zod           # For validation
npm install localstore firebase      # For Firebase sync
```

## Quick Start

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

LocalStore uses a plugin chain architecture where each method call passes through middleware plugins that can transform data or provide functionality.

```
Application → Collection → Plugin Chain → Storage/Search/Sync
```

### Plugin Interface

```typescript
interface Plugin {
  name: string;
  
  // Lifecycle
  install?: (collection: Collection) => void | Promise<void>;
  destroy?: () => void;
  
  // Data methods - middleware style
  get?: (next: NextFn, id: string) => Promise<Doc | undefined>;
  getAll?: (next: NextFn) => Promise<Doc[]>;
  put?: (next: NextFn, doc: Doc, opts?: WriteOptions) => Promise<void>;
  delete?: (next: NextFn, id: string, opts?: WriteOptions) => Promise<void>;
  clear?: (next: NextFn) => Promise<void>;
  search?: (next: NextFn, query: string, opts?: SearchOptions) => Promise<Doc[]>;
}
```

## Core Plugins

### Storage

#### indexedDB()
Persistent storage using IndexedDB.

```typescript
const collection = await localCollection('data',
  indexedDB({ database: 'myapp' })
);
```

#### memory()
Ephemeral in-memory storage.

```typescript
const collection = await localCollection('session',
  memory()
);
```

### Search

#### flexSearch()
Full-text search on specified fields.

```typescript
const collection = await localCollection('products',
  indexedDB(),
  flexSearch(['name', 'description', 'tags'])
);

const results = await collection.search('widget');
```

### Sync

#### broadcast()
Cross-tab synchronization via BroadcastChannel.

```typescript
const collection = await localCollection('shared',
  indexedDB(),
  broadcast()
);
```

#### firebaseSync()
Real-time sync with Firebase Realtime Database.

```typescript
const collection = await localCollection('users',
  indexedDB(),
  firebaseSync({ 
    path: 'users',
    conflict: 'merge' // or 'local-wins', 'server-wins'
  })
);
```

#### httpSync()
HTTP endpoint synchronization with polling support.

```typescript
const collection = await localCollection('data',
  indexedDB(),
  httpSync({
    endpoint: 'https://api.example.com/data',
    poll: 30000, // Poll every 30 seconds
    headers: { 'Authorization': 'Bearer token' }
  })
);
```

### Transform

#### timestamps()
Automatic created/updated timestamps.

```typescript
const collection = await localCollection('posts',
  indexedDB(),
  timestamps({ created: 'createdAt', updated: 'updatedAt' })
);
```

#### validate()
Schema validation using Zod.

```typescript
import { z } from 'zod';

const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
});

const collection = await localCollection('products',
  indexedDB(),
  validate(ProductSchema)
);
```

## Web Components

### `<local-data>` - Ingest from DOM

Load data from JSON or structured data in HTML:

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

<!-- From itemscope with mutation observer -->
<local-data collection="products" key="sku" observe>
  <div itemscope itemtype="https://schema.org/Product">
    <meta itemprop="sku" content="WIDGET-001">
    <span itemprop="name">Super Widget</span>
  </div>
</local-data>
```

### `<local-query>` - Render from Data

Declarative data binding with filtering and sorting:

```html
<local-query collection="products" filter="price < 50" sort="name" limit="10">
  <template>
    <div class="product">
      <h3>{{name}}</h3>
      <p>${{price}}</p>
    </div>
  </template>
</local-query>

<!-- With search -->
<input type="search" id="search">
<local-query collection="products" search="">
  <template>
    <div>{{name}}</div>
  </template>
</local-query>

<script>
  document.getElementById('search').addEventListener('input', (e) => {
    document.querySelector('local-query').setAttribute('search', e.target.value);
  });
</script>
```

### `<local-debug>` - Debug Panel

Development tool for browsing and editing collections:

```html
<local-debug></local-debug>
```

## Events

Collections emit events for all operations:

```typescript
// Collection events
collection.addEventListener('change', (e) => {
  const { op, id, doc, timestamp } = e.detail;
  // op: 'put' | 'delete' | 'clear'
});

// Global events
localCollection.addEventListener('change', (e) => {
  const { collection, op, id, doc } = e.detail;
  console.log(`[${collection}] ${op}:`, id);
});

// Sync events
collection.addEventListener('sync:error', (e) => {
  console.error('Sync failed:', e.detail.error);
});

collection.addEventListener('sync:conflict', (e) => {
  const { id, local, remote, resolution } = e.detail;
  console.log('Conflict resolved:', resolution);
});
```

## Global API

```typescript
// Get a collection by name
const products = localCollection.get('products');

// Get all collections
const all = localCollection.all(); // Map<string, Collection>

// Global event listening
localCollection.addEventListener('change', handler);

// Network status
console.log(localCollection.online); // true/false

// Offline queue status
console.log(localCollection.queue.size);
console.log(localCollection.queue.syncing);

// Clean up all collections
await localCollection.close();
```

## Creating Custom Plugins

```typescript
function myPlugin(): Plugin {
  return {
    name: 'my-plugin',
    
    // Called when plugin is added to collection
    async install(collection) {
      console.log(`Installing on ${collection.name}`);
    },
    
    // Wrap the put method
    async put(next, doc, opts) {
      // Transform before storage
      const transformed = { ...doc, custom: true };
      
      // Call next plugin in chain
      await next(transformed, opts);
      
      // Do something after storage
      console.log('Stored:', doc.id);
    },
    
    // Listen to events
    install(collection) {
      collection.addEventListener('change', (e) => {
        console.log('Change detected:', e.detail);
      });
    }
  };
}
```

## Bundle Sizes

| Bundle | Size | Gzipped |
|--------|------|---------|
| **main** | 29.3 KB | 8.8 KB |
| core | 3.3 KB | 1.2 KB |
| storage | 3.4 KB | 1.3 KB |
| search | 2.1 KB | 1.1 KB |
| transform | 3.7 KB | 1.5 KB |
| sync | 20.2 KB | 6.0 KB |
| queue | 7.4 KB | 2.1 KB |
| components | 30.4 KB | 7.8 KB |

> **Note:** `firebase`, `flexsearch`, and `zod` are optional peer dependencies - only install what you need.

### Tree-Shaking

Import only what you need:

```typescript
// Full bundle (includes all dependencies)
import { localCollection, memory, httpSync, flexSearch } from 'localstore';

// Or import separately for smaller bundles
import { localCollection } from 'localstore/core';
import { memory, indexedDB } from 'localstore/plugins/storage';
import { httpSync, broadcast } from 'localstore/plugins/sync';
import { flexSearch } from 'localstore/plugins/search';
import { timestamps, validate } from 'localstore/plugins/transform';
import { OfflineQueue } from 'localstore/plugins/queue';
```

## Offline Queue

The offline queue automatically handles failed sync operations:

```typescript
import { OfflineQueue } from 'localstore/plugins/queue';

const queue = new OfflineQueue({
  storage: 'indexeddb',
  maxRetries: 5,
  retryDelay: 1000,
  handler: async (item) => {
    await fetch(item.data.url, item.data.options);
  }
});

// Queue events
queue.on('failed', ({ item, error }) => {
  console.error('Operation failed:', error);
});

queue.on('drain', () => {
  console.log('Queue empty');
});

// Queue management
queue.pause();
queue.resume();
await queue.retryAll();
const stats = queue.getStats();
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test              # Unit tests
bun run test:browser  # Browser tests
bun run test:all      # All tests

# Build
bun run build

# Type check
bun run typecheck

# Run examples
bun run example
bun run showcase
```

## License

MIT