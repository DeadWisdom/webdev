/**
 * Browser tests for <local-query> web component
 * Run with: bunx web-test-runner
 */

import { expect } from '@esm-bundle/chai';
import { localCollection } from '../registry.ts';
import { memory } from '../plugins/storage/memory.ts';
import './local-query.ts';

// Helper to wait
const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to create and mount component
const createComponent = async (html: string): Promise<HTMLElement> => {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  await waitFor(100);
  return container;
};

// Setup test data
const setupTestCollection = async (name: string, data: any[]) => {
  const collection = await localCollection(name, memory());
  for (const item of data) {
    await collection.put(item);
  }
  return collection;
};

// Cleanup after each test
afterEach(async () => {
  document.body.innerHTML = '';
  await localCollection.close();
});

describe('<local-query>', () => {
  describe('Basic rendering', () => {
    it('renders documents with template', async () => {
      await setupTestCollection('users', [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ]);

      await createComponent(`
        <local-query collection="users">
          <template>
            <div class="user">{{name}}</div>
          </template>
        </local-query>
      `);

      await waitFor(200);

      const users = document.querySelectorAll('.user');
      expect(users.length).to.equal(2);

      const names = Array.from(users).map(u => u.textContent);
      expect(names).to.include.members(['Alice', 'Bob']);
    });

    it('shows empty template when no documents', async () => {
      await setupTestCollection('empty-col', []);

      await createComponent(`
        <local-query collection="empty-col">
          <template>
            <div class="item">{{name}}</div>
          </template>
          <template slot="empty">
            <div class="empty-message">No items found</div>
          </template>
        </local-query>
      `);

      await waitFor(200);

      const emptyMsg = document.querySelector('.empty-message');
      expect(emptyMsg).to.exist;
      expect(emptyMsg!.textContent).to.equal('No items found');
    });

    it('interpolates nested properties', async () => {
      await setupTestCollection('nested', [
        { id: '1', user: { name: 'Alice', profile: { city: 'NYC' } } },
      ]);

      await createComponent(`
        <local-query collection="nested">
          <template>
            <div class="card">
              <span class="name">{{user.name}}</span>
              <span class="city">{{user.profile.city}}</span>
            </div>
          </template>
        </local-query>
      `);

      await waitFor(200);

      expect(document.querySelector('.name')!.textContent).to.equal('Alice');
      expect(document.querySelector('.city')!.textContent).to.equal('NYC');
    });

    it('interpolates attributes', async () => {
      await setupTestCollection('attrs', [
        { id: '1', imageUrl: 'https://example.com/img.jpg', alt: 'Test image' },
      ]);

      await createComponent(`
        <local-query collection="attrs">
          <template>
            <img src="{{imageUrl}}" alt="{{alt}}">
          </template>
        </local-query>
      `);

      await waitFor(200);

      const img = document.querySelector('img');
      expect(img!.getAttribute('src')).to.equal('https://example.com/img.jpg');
      expect(img!.getAttribute('alt')).to.equal('Test image');
    });
  });

  describe('Filtering', () => {
    beforeEach(async () => {
      await setupTestCollection('products', [
        { id: '1', name: 'Laptop', category: 'electronics', price: 999 },
        { id: '2', name: 'Phone', category: 'electronics', price: 599 },
        { id: '3', name: 'Desk', category: 'furniture', price: 299 },
        { id: '4', name: 'Chair', category: 'furniture', price: 199 },
      ]);
    });

    it('filters with equality', async () => {
      await createComponent(`
        <local-query collection="products" filter="category == 'electronics'">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      expect(items.length).to.equal(2);

      const names = Array.from(items).map(i => i.textContent);
      expect(names).to.include.members(['Laptop', 'Phone']);
    });

    it('filters with inequality', async () => {
      await createComponent(`
        <local-query collection="products" filter="category != 'electronics'">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      expect(items.length).to.equal(2);

      const names = Array.from(items).map(i => i.textContent);
      expect(names).to.include.members(['Desk', 'Chair']);
    });

    it('filters with greater than', async () => {
      await createComponent(`
        <local-query collection="products" filter="price > 500">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      expect(items.length).to.equal(2);

      const names = Array.from(items).map(i => i.textContent);
      expect(names).to.include.members(['Laptop', 'Phone']);
    });

    it('filters with less than or equal', async () => {
      await createComponent(`
        <local-query collection="products" filter="price <= 299">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      expect(items.length).to.equal(2);

      const names = Array.from(items).map(i => i.textContent);
      expect(names).to.include.members(['Desk', 'Chair']);
    });

    it('filters with contains', async () => {
      await createComponent(`
        <local-query collection="products" filter="name contains 'a'">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      const names = Array.from(items).map(i => i.textContent);
      expect(names).to.include('Laptop');
      expect(names).to.include('Chair');
    });
  });

  describe('Sorting', () => {
    beforeEach(async () => {
      await setupTestCollection('sortable', [
        { id: '3', name: 'Charlie', age: 35 },
        { id: '1', name: 'Alice', age: 25 },
        { id: '2', name: 'Bob', age: 30 },
      ]);
    });

    it('sorts ascending by default', async () => {
      await createComponent(`
        <local-query collection="sortable" sort="name">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      const names = Array.from(items).map(i => i.textContent);
      expect(names).to.deep.equal(['Alice', 'Bob', 'Charlie']);
    });

    it('sorts descending with sort-dir', async () => {
      await createComponent(`
        <local-query collection="sortable" sort="age" sort-dir="desc">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      const names = Array.from(items).map(i => i.textContent);
      expect(names).to.deep.equal(['Charlie', 'Bob', 'Alice']);
    });

    it('sorts numbers correctly', async () => {
      await createComponent(`
        <local-query collection="sortable" sort="age">
          <template><div class="item" data-age="{{age}}">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      const ages = Array.from(items).map(i => i.getAttribute('data-age'));
      expect(ages).to.deep.equal(['25', '30', '35']);
    });
  });

  describe('Pagination', () => {
    beforeEach(async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        id: String(i + 1),
        name: `Item ${i + 1}`,
      }));
      await setupTestCollection('paginated', items);
    });

    it('limits results with limit attribute', async () => {
      await createComponent(`
        <local-query collection="paginated" limit="3">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      expect(items.length).to.equal(3);
    });

    it('offsets results with offset attribute', async () => {
      await createComponent(`
        <local-query collection="paginated" offset="5" limit="3">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const items = document.querySelectorAll('.item');
      expect(items.length).to.equal(3);

      const names = Array.from(items).map(i => i.textContent);
      expect(names).to.deep.equal(['Item 6', 'Item 7', 'Item 8']);
    });
  });

  describe('Live updates', () => {
    it('updates when collection changes with live attribute', async () => {
      const collection = await setupTestCollection('live-test', [
        { id: '1', name: 'Initial' },
      ]);

      await createComponent(`
        <local-query collection="live-test" live>
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      let items = document.querySelectorAll('.item');
      expect(items.length).to.equal(1);

      // Add new item
      await collection.put({ id: '2', name: 'New Item' });
      await waitFor(200);

      items = document.querySelectorAll('.item');
      expect(items.length).to.equal(2);
    });
  });

  describe('Public API', () => {
    it('getCollection returns bound collection', async () => {
      await setupTestCollection('api-test', [{ id: '1' }]);

      await createComponent(`
        <local-query collection="api-test">
          <template><div>{{id}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const element = document.querySelector('local-query') as any;
      const collection = element.getCollection();

      expect(collection).to.exist;
      expect(collection.name).to.equal('api-test');
    });

    it('getQueryOptions returns current options', async () => {
      await setupTestCollection('options-test', [{ id: '1' }]);

      await createComponent(`
        <local-query collection="options-test" filter="id == '1'" sort="id" limit="10">
          <template><div>{{id}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const element = document.querySelector('local-query') as any;
      const options = element.getQueryOptions();

      expect(options.filter).to.equal("id == '1'");
      expect(options.sort).to.equal('id');
      expect(options.limit).to.equal(10);
    });

    it('setQueryOptions updates query', async () => {
      await setupTestCollection('set-options', [
        { id: '1', name: 'A' },
        { id: '2', name: 'B' },
        { id: '3', name: 'C' },
      ]);

      await createComponent(`
        <local-query collection="set-options">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      const element = document.querySelector('local-query') as any;

      // Initially should show all
      expect(document.querySelectorAll('.item').length).to.equal(3);

      // Set limit
      element.setQueryOptions({ limit: 1 });
      await waitFor(200);

      expect(document.querySelectorAll('.item').length).to.equal(1);
    });

    it('refresh re-renders data', async () => {
      const collection = await setupTestCollection('refresh-test', [
        { id: '1', name: 'Original' },
      ]);

      await createComponent(`
        <local-query collection="refresh-test">
          <template><div class="item">{{name}}</div></template>
        </local-query>
      `);

      await waitFor(200);

      // Update data directly
      await collection.put({ id: '1', name: 'Updated' });

      const element = document.querySelector('local-query') as any;
      await element.refresh();
      await waitFor(100);

      const item = document.querySelector('.item');
      expect(item!.textContent).to.equal('Updated');
    });
  });
});
