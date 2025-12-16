/**
 * <local-data> Web Component
 *
 * Declaratively load data from HTML into LocalStore collections.
 * Supports JSON script tags, JSON-LD, and microdata.
 *
 * @example
 * ```html
 * <local-data collection="users">
 *   <script type="application/json">
 *     [
 *       { "id": "1", "name": "Alice" },
 *       { "id": "2", "name": "Bob" }
 *     ]
 *   </script>
 * </local-data>
 *
 * <local-data collection="products" src="/api/products.json"></local-data>
 *
 * <local-data collection="article">
 *   <article itemscope itemtype="https://schema.org/Article">
 *     <h1 itemprop="name">Article Title</h1>
 *     <p itemprop="description">Article description</p>
 *   </article>
 * </local-data>
 * ```
 */

import { localCollection } from '../registry.ts';
import { memory } from '../plugins/storage/memory.ts';
import type { Doc, Collection } from '../types.ts';

export class LocalData extends HTMLElement {
  private collection: Collection | null = null;
  private observer: MutationObserver | null = null;
  private initialized = false;

  static get observedAttributes() {
    return ['collection', 'src', 'observe'];
  }

  constructor() {
    super();
  }

  async connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;

    await this.initCollection();
    await this.loadData();

    // Set up mutation observer if observe attribute is present
    if (this.hasAttribute('observe')) {
      this.setupObserver();
    }
  }

  disconnectedCallback() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (!this.initialized || oldValue === newValue) return;

    if (name === 'collection') {
      this.initCollection().then(() => this.loadData());
    } else if (name === 'src') {
      this.loadFromSrc();
    } else if (name === 'observe') {
      if (newValue !== null) {
        this.setupObserver();
      } else if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    }
  }

  // ========== Collection Management ==========

  private async initCollection(): Promise<void> {
    const name = this.getAttribute('collection');
    if (!name) {
      console.warn('<local-data>: collection attribute is required');
      return;
    }

    // Try to get existing collection or create new one
    const existing = localCollection.get(name);
    if (existing) {
      this.collection = existing;
    } else {
      // Create with memory storage by default
      // Users can pre-create collections with different storage if needed
      this.collection = await localCollection(name, memory());
    }
  }

  // ========== Data Loading ==========

  private async loadData(): Promise<void> {
    if (!this.collection) return;

    // Load from src attribute if present
    if (this.hasAttribute('src')) {
      await this.loadFromSrc();
    }

    // Parse inline data
    await this.parseInlineData();
  }

  private async loadFromSrc(): Promise<void> {
    const src = this.getAttribute('src');
    if (!src || !this.collection) return;

    try {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      await this.importData(data);

      this.dispatchEvent(new CustomEvent('load', {
        detail: { src, count: Array.isArray(data) ? data.length : 1 }
      }));
    } catch (error) {
      console.error(`<local-data>: Failed to load from ${src}:`, error);
      this.dispatchEvent(new CustomEvent('error', {
        detail: { src, error }
      }));
    }
  }

  private async parseInlineData(): Promise<void> {
    if (!this.collection) return;

    // Parse JSON script tags
    const jsonScripts = this.querySelectorAll('script[type="application/json"]');
    for (const script of jsonScripts) {
      await this.parseJsonScript(script as HTMLScriptElement);
    }

    // Parse JSON-LD script tags
    const ldScripts = this.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
      await this.parseJsonLdScript(script as HTMLScriptElement);
    }

    // Parse microdata
    const itemscopes = this.querySelectorAll('[itemscope]');
    for (const element of itemscopes) {
      // Only parse top-level itemscopes (not nested ones)
      if (!element.closest('[itemscope] [itemscope]') || element.closest('[itemscope]') === element) {
        await this.parseMicrodata(element as HTMLElement);
      }
    }
  }

  private async parseJsonScript(script: HTMLScriptElement): Promise<void> {
    try {
      const text = script.textContent?.trim();
      if (!text) return;

      const data = JSON.parse(text);
      await this.importData(data);
    } catch (error) {
      console.error('<local-data>: Failed to parse JSON script:', error);
    }
  }

  private async parseJsonLdScript(script: HTMLScriptElement): Promise<void> {
    try {
      const text = script.textContent?.trim();
      if (!text) return;

      const data = JSON.parse(text);

      // JSON-LD can have @graph for multiple items
      if (data['@graph'] && Array.isArray(data['@graph'])) {
        await this.importData(data['@graph']);
      } else {
        await this.importData(data);
      }
    } catch (error) {
      console.error('<local-data>: Failed to parse JSON-LD script:', error);
    }
  }

  private async parseMicrodata(element: HTMLElement): Promise<void> {
    const doc = this.extractMicrodata(element);
    if (doc && doc.id) {
      await this.collection?.put(doc);
    }
  }

  private extractMicrodata(element: HTMLElement): Doc | null {
    const doc: Doc = { id: '' };

    // Get itemtype as a type hint
    const itemtype = element.getAttribute('itemtype');
    if (itemtype) {
      doc['@type'] = itemtype;
    }

    // Get itemid as the document id
    const itemid = element.getAttribute('itemid');
    if (itemid) {
      doc.id = itemid;
    }

    // Extract all itemprop values
    const props = element.querySelectorAll('[itemprop]');
    for (const prop of props) {
      // Skip nested itemscope properties (they belong to nested items)
      const closestScope = prop.closest('[itemscope]');
      if (closestScope !== element) continue;

      const name = prop.getAttribute('itemprop');
      if (!name) continue;

      const value = this.getMicrodataValue(prop as HTMLElement);

      // Handle multiple values with same property name
      if (name in doc) {
        if (Array.isArray(doc[name])) {
          (doc[name] as any[]).push(value);
        } else {
          doc[name] = [doc[name], value];
        }
      } else {
        doc[name] = value;
      }
    }

    // Generate id if not provided
    if (!doc.id) {
      doc.id = this.generateId(doc);
    }

    return doc;
  }

  private getMicrodataValue(element: HTMLElement): any {
    // Check for nested itemscope
    if (element.hasAttribute('itemscope')) {
      return this.extractMicrodata(element);
    }

    // Get value based on element type
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'meta') {
      return element.getAttribute('content') || '';
    }

    if (tagName === 'a' || tagName === 'link') {
      return element.getAttribute('href') || '';
    }

    if (tagName === 'img' || tagName === 'audio' || tagName === 'video' || tagName === 'source') {
      return element.getAttribute('src') || '';
    }

    if (tagName === 'data' || tagName === 'meter') {
      return element.getAttribute('value') || element.textContent?.trim() || '';
    }

    if (tagName === 'time') {
      return element.getAttribute('datetime') || element.textContent?.trim() || '';
    }

    // Default to text content
    return element.textContent?.trim() || '';
  }

  private generateId(doc: Doc): string {
    // Try to generate a meaningful id from the data
    if (doc.name) return String(doc.name).toLowerCase().replace(/\s+/g, '-');
    if (doc.title) return String(doc.title).toLowerCase().replace(/\s+/g, '-');

    // Fall back to random id
    return `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ========== Data Import ==========

  private async importData(data: any): Promise<void> {
    if (!this.collection) return;

    if (Array.isArray(data)) {
      for (const item of data) {
        await this.importItem(item);
      }
    } else if (data && typeof data === 'object') {
      await this.importItem(data);
    }
  }

  private async importItem(item: any): Promise<void> {
    if (!this.collection || !item || typeof item !== 'object') return;

    // Ensure item has an id
    const doc: Doc = { ...item };

    // Handle JSON-LD @id
    if (doc['@id'] && !doc.id) {
      doc.id = doc['@id'];
    }

    // Generate id if still missing
    if (!doc.id) {
      doc.id = this.generateId(doc);
    }

    await this.collection.put(doc);
  }

  // ========== Mutation Observer ==========

  private setupObserver(): void {
    if (this.observer) return;

    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.observer.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['itemprop', 'itemscope', 'itemid', 'content', 'href', 'src', 'value', 'datetime']
    });
  }

  private async handleMutations(mutations: MutationRecord[]): Promise<void> {
    // Debounce mutation handling
    if ((this as any)._mutationTimeout) {
      clearTimeout((this as any)._mutationTimeout);
    }

    (this as any)._mutationTimeout = setTimeout(async () => {
      await this.parseInlineData();

      this.dispatchEvent(new CustomEvent('update', {
        detail: { mutations: mutations.length }
      }));
    }, 100);
  }

  // ========== Public API ==========

  /**
   * Get the bound collection
   */
  getCollection(): Collection | null {
    return this.collection;
  }

  /**
   * Manually trigger data reload
   */
  async reload(): Promise<void> {
    await this.loadData();
  }

  /**
   * Clear all data in the collection
   */
  async clear(): Promise<void> {
    await this.collection?.clear();
  }
}

// Register the custom element
if (typeof customElements !== 'undefined') {
  customElements.define('local-data', LocalData);
}
