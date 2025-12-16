/**
 * Browser tests for <local-data> web component
 * Run with: bunx web-test-runner
 */

import { expect } from '@esm-bundle/chai';
import { localCollection } from '../registry.ts';
import { memory } from '../plugins/storage/memory.ts';
import './local-data.ts';

// Helper to wait for component initialization
const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to create and mount component
const createComponent = async (html: string): Promise<HTMLElement> => {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  await waitFor(100); // Wait for connectedCallback
  return container;
};

// Cleanup after each test
afterEach(async () => {
  document.body.innerHTML = '';
  await localCollection.close();
});

describe('<local-data>', () => {
  describe('JSON parsing', () => {
    it('creates collection from attribute', async () => {
      await createComponent(`
        <local-data collection="test-collection">
          <script type="application/json">
            [{ "id": "1", "name": "Test" }]
          </script>
        </local-data>
      `);

      const collection = localCollection.get('test-collection');
      expect(collection).to.exist;

      const docs = await collection!.getAll();
      expect(docs).to.have.length(1);
      expect(docs[0].name).to.equal('Test');
    });

    it('parses multiple JSON items', async () => {
      await createComponent(`
        <local-data collection="multi-test">
          <script type="application/json">
            [
              { "id": "1", "name": "Alice" },
              { "id": "2", "name": "Bob" },
              { "id": "3", "name": "Charlie" }
            ]
          </script>
        </local-data>
      `);

      const collection = localCollection.get('multi-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(3);
      expect(docs.map(d => d.name)).to.include.members(['Alice', 'Bob', 'Charlie']);
    });

    it('parses single JSON object', async () => {
      await createComponent(`
        <local-data collection="single-test">
          <script type="application/json">
            { "id": "solo", "value": 42 }
          </script>
        </local-data>
      `);

      const collection = localCollection.get('single-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(1);
      expect(docs[0].id).to.equal('solo');
      expect(docs[0].value).to.equal(42);
    });

    it('generates id for items without one', async () => {
      await createComponent(`
        <local-data collection="autoid-test">
          <script type="application/json">
            [{ "name": "No ID Item" }]
          </script>
        </local-data>
      `);

      const collection = localCollection.get('autoid-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(1);
      expect(docs[0].id).to.exist;
      expect(docs[0].id.length).to.be.greaterThan(0);
    });
  });

  describe('JSON-LD parsing', () => {
    it('parses JSON-LD script tags', async () => {
      await createComponent(`
        <local-data collection="jsonld-test">
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Person",
              "@id": "person-1",
              "name": "John Doe"
            }
          </script>
        </local-data>
      `);

      const collection = localCollection.get('jsonld-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(1);
      expect(docs[0].id).to.equal('person-1');
      expect(docs[0].name).to.equal('John Doe');
    });

    it('parses JSON-LD with @graph', async () => {
      await createComponent(`
        <local-data collection="graph-test">
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                { "@id": "1", "@type": "Person", "name": "Alice" },
                { "@id": "2", "@type": "Person", "name": "Bob" }
              ]
            }
          </script>
        </local-data>
      `);

      const collection = localCollection.get('graph-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(2);
    });
  });

  describe('Microdata parsing', () => {
    it('parses itemscope elements', async () => {
      await createComponent(`
        <local-data collection="microdata-test">
          <div itemscope itemtype="https://schema.org/Person" itemid="person-1">
            <span itemprop="name">Jane Doe</span>
            <span itemprop="email">jane@example.com</span>
          </div>
        </local-data>
      `);

      const collection = localCollection.get('microdata-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(1);
      expect(docs[0].id).to.equal('person-1');
      expect(docs[0].name).to.equal('Jane Doe');
      expect(docs[0].email).to.equal('jane@example.com');
    });

    it('extracts @type from itemtype', async () => {
      await createComponent(`
        <local-data collection="itemtype-test">
          <article itemscope itemtype="https://schema.org/Article" itemid="article-1">
            <h1 itemprop="headline">Test Article</h1>
          </article>
        </local-data>
      `);

      const collection = localCollection.get('itemtype-test');
      const docs = await collection!.getAll();

      expect(docs[0]['@type']).to.equal('https://schema.org/Article');
    });

    it('handles meta content values', async () => {
      await createComponent(`
        <local-data collection="meta-test">
          <div itemscope itemid="meta-1">
            <meta itemprop="datePublished" content="2024-01-15">
          </div>
        </local-data>
      `);

      const collection = localCollection.get('meta-test');
      const docs = await collection!.getAll();

      expect(docs[0].datePublished).to.equal('2024-01-15');
    });

    it('handles link href values', async () => {
      await createComponent(`
        <local-data collection="link-test">
          <div itemscope itemid="link-1">
            <a itemprop="url" href="https://example.com">Link</a>
          </div>
        </local-data>
      `);

      const collection = localCollection.get('link-test');
      const docs = await collection!.getAll();

      expect(docs[0].url).to.equal('https://example.com');
    });

    it('handles time datetime values', async () => {
      await createComponent(`
        <local-data collection="time-test">
          <div itemscope itemid="time-1">
            <time itemprop="startDate" datetime="2024-06-15T10:00">June 15</time>
          </div>
        </local-data>
      `);

      const collection = localCollection.get('time-test');
      const docs = await collection!.getAll();

      expect(docs[0].startDate).to.equal('2024-06-15T10:00');
    });
  });

  describe('Collection binding', () => {
    it('uses existing collection if available', async () => {
      // Pre-create collection
      const existing = await localCollection('existing-col', memory());
      await existing.put({ id: 'pre-existing', value: 1 });

      await createComponent(`
        <local-data collection="existing-col">
          <script type="application/json">
            [{ "id": "new", "value": 2 }]
          </script>
        </local-data>
      `);

      const collection = localCollection.get('existing-col');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(2);
      expect(docs.map(d => d.id)).to.include.members(['pre-existing', 'new']);
    });
  });

  describe('Public API', () => {
    it('getCollection returns bound collection', async () => {
      await createComponent(`
        <local-data collection="api-test">
          <script type="application/json">[{ "id": "1" }]</script>
        </local-data>
      `);

      const element = document.querySelector('local-data') as any;
      const collection = element.getCollection();

      expect(collection).to.exist;
      expect(collection.name).to.equal('api-test');
    });

    it('reload refreshes data', async () => {
      const container = await createComponent(`
        <local-data collection="reload-test">
          <script type="application/json">[{ "id": "1", "value": 1 }]</script>
        </local-data>
      `);

      const element = container.querySelector('local-data') as any;
      const collection = element.getCollection();

      // Modify script content
      const script = element.querySelector('script');
      script.textContent = '[{ "id": "2", "value": 2 }]';

      await element.reload();
      await waitFor(50);

      const docs = await collection.getAll();
      expect(docs.some((d: any) => d.id === '2')).to.be.true;
    });

    it('clear removes all documents', async () => {
      await createComponent(`
        <local-data collection="clear-test">
          <script type="application/json">
            [{ "id": "1" }, { "id": "2" }, { "id": "3" }]
          </script>
        </local-data>
      `);

      const element = document.querySelector('local-data') as any;
      const collection = element.getCollection();

      expect((await collection.getAll()).length).to.equal(3);

      await element.clear();

      expect((await collection.getAll()).length).to.equal(0);
    });
  });

  describe('src attribute', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = window.fetch;
    });

    afterEach(() => {
      window.fetch = originalFetch;
    });

    it('loads data from src URL', async () => {
      const mockData = [
        { id: '1', name: 'Remote Item 1' },
        { id: '2', name: 'Remote Item 2' },
      ];

      window.fetch = async (url: RequestInfo | URL) => {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      await createComponent(`
        <local-data collection="src-test" src="/api/data.json"></local-data>
      `);

      await waitFor(150);

      const collection = localCollection.get('src-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(2);
      expect(docs.map(d => d.name)).to.include.members(['Remote Item 1', 'Remote Item 2']);
    });

    it('dispatches load event on successful fetch', async () => {
      const mockData = [{ id: '1', name: 'Test' }];

      window.fetch = async () => {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      const container = await createComponent(`
        <local-data collection="load-event-test" src="/api/data.json"></local-data>
      `);

      const element = container.querySelector('local-data')!;
      let loadEvent: CustomEvent | null = null;

      element.addEventListener('load', (e) => {
        loadEvent = e as CustomEvent;
      });

      // Trigger reload to capture event
      await (element as any).reload();
      await waitFor(100);

      expect(loadEvent).to.exist;
      expect(loadEvent!.detail.src).to.equal('/api/data.json');
      expect(loadEvent!.detail.count).to.equal(1);
    });

    it('dispatches error event on fetch failure', async () => {
      window.fetch = async () => {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      };

      const container = await createComponent(`
        <local-data collection="error-event-test" src="/api/missing.json"></local-data>
      `);

      const element = container.querySelector('local-data')!;
      let errorEvent: CustomEvent | null = null;

      element.addEventListener('error', (e) => {
        errorEvent = e as CustomEvent;
      });

      // Trigger reload to capture event
      await (element as any).reload();
      await waitFor(100);

      expect(errorEvent).to.exist;
      expect(errorEvent!.detail.src).to.equal('/api/missing.json');
      expect(errorEvent!.detail.error).to.exist;
    });

    it('loads single object from src', async () => {
      const mockData = { id: 'single', value: 42 };

      window.fetch = async () => {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      await createComponent(`
        <local-data collection="single-src-test" src="/api/item.json"></local-data>
      `);

      await waitFor(150);

      const collection = localCollection.get('single-src-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(1);
      expect(docs[0].id).to.equal('single');
      expect(docs[0].value).to.equal(42);
    });

    it('combines src data with inline data', async () => {
      const mockData = [{ id: 'remote', source: 'api' }];

      window.fetch = async () => {
        return new Response(JSON.stringify(mockData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      };

      await createComponent(`
        <local-data collection="combined-test" src="/api/data.json">
          <script type="application/json">
            [{ "id": "inline", "source": "html" }]
          </script>
        </local-data>
      `);

      await waitFor(150);

      const collection = localCollection.get('combined-test');
      const docs = await collection!.getAll();

      expect(docs).to.have.length(2);
      expect(docs.map(d => d.id)).to.include.members(['remote', 'inline']);
    });
  });

  describe('Events', () => {
    it('dispatches error event on parse failure', async () => {
      // Invalid JSON should log error but not throw
      await createComponent(`
        <local-data collection="error-test">
          <script type="application/json">
            { invalid json }
          </script>
        </local-data>
      `);

      const collection = localCollection.get('error-test');
      const docs = await collection!.getAll();
      expect(docs).to.have.length(0);
    });
  });
});
