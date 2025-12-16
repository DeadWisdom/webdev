/**
 * <local-query> Web Component
 *
 * Query and render collection data with templates.
 * Supports filtering, sorting, search, pagination, and live updates.
 *
 * @example
 * ```html
 * <local-query collection="users" filter="role == 'admin'" sort="name" limit="10">
 *   <template>
 *     <div class="user">
 *       <h3>{{name}}</h3>
 *       <p>{{email}}</p>
 *     </div>
 *   </template>
 *   <template slot="empty">
 *     <p>No users found</p>
 *   </template>
 *   <template slot="loading">
 *     <p>Loading...</p>
 *   </template>
 * </local-query>
 *
 * <local-query collection="products" search="laptop">
 *   <template>
 *     <div>{{name}} - ${{price}}</div>
 *   </template>
 * </local-query>
 * ```
 */

import { localCollection } from '../registry.ts';
import type { Doc, Collection } from '../types.ts';

export interface QueryOptions {
  filter?: string;
  sort?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  search?: string;
}

export class LocalQuery extends HTMLElement {
  private collection: Collection | null = null;
  private unsubscribe: (() => void) | null = null;
  private template: HTMLTemplateElement | null = null;
  private emptyTemplate: HTMLTemplateElement | null = null;
  private loadingTemplate: HTMLTemplateElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private initialized = false;
  private loading = false;

  static get observedAttributes() {
    return ['collection', 'filter', 'sort', 'sort-dir', 'limit', 'offset', 'search', 'live'];
  }

  constructor() {
    super();
  }

  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;

    this.setupTemplates();
    this.setupContainer();
    this.bindCollection();
  }

  disconnectedCallback() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (!this.initialized || oldValue === newValue) return;

    if (name === 'collection') {
      this.bindCollection();
    } else {
      // Re-render on any query attribute change
      this.render();
    }
  }

  // ========== Setup ==========

  private setupTemplates(): void {
    // Find the main template
    this.template = this.querySelector('template:not([slot])');

    // Find slot templates
    this.emptyTemplate = this.querySelector('template[slot="empty"]');
    this.loadingTemplate = this.querySelector('template[slot="loading"]');
  }

  private setupContainer(): void {
    // Create a container for results if not using shadow DOM
    this.resultsContainer = document.createElement('div');
    this.resultsContainer.className = 'local-query-results';
    this.appendChild(this.resultsContainer);
  }

  private async bindCollection(): Promise<void> {
    // Clean up previous subscription
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    const name = this.getAttribute('collection');
    if (!name) {
      console.warn('<local-query>: collection attribute is required');
      return;
    }

    // Wait for collection to be available
    this.collection = localCollection.get(name) || null;

    if (!this.collection) {
      // Collection doesn't exist yet, wait for it
      this.showLoading();

      // Poll for collection availability
      const checkInterval = setInterval(() => {
        this.collection = localCollection.get(name) || null;
        if (this.collection) {
          clearInterval(checkInterval);
          this.subscribeToChanges();
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!this.collection) {
          console.warn(`<local-query>: Collection '${name}' not found after 5 seconds`);
          this.showEmpty();
        }
      }, 5000);

      return;
    }

    this.subscribeToChanges();
  }

  private subscribeToChanges(): void {
    if (!this.collection) return;

    const isLive = this.hasAttribute('live');

    if (isLive) {
      // Subscribe to changes for live updates
      this.unsubscribe = this.collection.subscribe(() => {
        this.render();
      });
    } else {
      // Just render once
      this.render();
    }
  }

  // ========== Rendering ==========

  private showLoading(): void {
    if (!this.resultsContainer) return;

    this.loading = true;

    if (this.loadingTemplate) {
      this.resultsContainer.innerHTML = '';
      this.resultsContainer.appendChild(this.loadingTemplate.content.cloneNode(true));
    } else {
      this.resultsContainer.innerHTML = '<span class="loading">Loading...</span>';
    }
  }

  private showEmpty(): void {
    if (!this.resultsContainer) return;

    if (this.emptyTemplate) {
      this.resultsContainer.innerHTML = '';
      this.resultsContainer.appendChild(this.emptyTemplate.content.cloneNode(true));
    } else {
      this.resultsContainer.innerHTML = '';
    }
  }

  private async render(): Promise<void> {
    if (!this.collection || !this.resultsContainer) return;

    this.loading = true;

    try {
      let docs = await this.fetchData();

      // Apply client-side transformations
      docs = this.applyFilter(docs);
      docs = this.applySort(docs);
      docs = this.applyPagination(docs);

      this.loading = false;

      if (docs.length === 0) {
        this.showEmpty();
        return;
      }

      this.renderDocs(docs);

      this.dispatchEvent(new CustomEvent('render', {
        detail: { count: docs.length }
      }));

    } catch (error) {
      this.loading = false;
      console.error('<local-query>: Render error:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: { error } }));
    }
  }

  private async fetchData(): Promise<Doc[]> {
    if (!this.collection) return [];

    const searchQuery = this.getAttribute('search');

    // Use search if available and query is provided
    if (searchQuery && typeof this.collection.search === 'function') {
      try {
        return await this.collection.search(searchQuery);
      } catch {
        // Fall back to getAll if search fails
        return await this.collection.getAll();
      }
    }

    return await this.collection.getAll();
  }

  private applyFilter(docs: Doc[]): Doc[] {
    const filterExpr = this.getAttribute('filter');
    if (!filterExpr) return docs;

    try {
      const filterFn = this.parseFilter(filterExpr);
      return docs.filter(filterFn);
    } catch (error) {
      console.error('<local-query>: Invalid filter expression:', error);
      return docs;
    }
  }

  private parseFilter(expr: string): (doc: Doc) => boolean {
    // Simple expression parser for common operations
    // Supports: field == value, field != value, field > value, field < value,
    //           field >= value, field <= value, field contains value

    const patterns = [
      { regex: /^(\w+)\s*==\s*(.+)$/, op: 'eq' },
      { regex: /^(\w+)\s*!=\s*(.+)$/, op: 'neq' },
      { regex: /^(\w+)\s*>=\s*(.+)$/, op: 'gte' },
      { regex: /^(\w+)\s*<=\s*(.+)$/, op: 'lte' },
      { regex: /^(\w+)\s*>\s*(.+)$/, op: 'gt' },
      { regex: /^(\w+)\s*<\s*(.+)$/, op: 'lt' },
      { regex: /^(\w+)\s+contains\s+(.+)$/i, op: 'contains' },
      { regex: /^(\w+)\s+startsWith\s+(.+)$/i, op: 'startsWith' },
      { regex: /^(\w+)\s+endsWith\s+(.+)$/i, op: 'endsWith' },
    ];

    for (const { regex, op } of patterns) {
      const match = expr.match(regex);
      if (match) {
        const field = match[1];
        const rawValue = match[2].trim();
        const value = this.parseValue(rawValue);

        return (doc: Doc) => {
          const docValue = this.getNestedValue(doc, field);

          switch (op) {
            case 'eq': return docValue === value;
            case 'neq': return docValue !== value;
            case 'gt': return docValue > value;
            case 'lt': return docValue < value;
            case 'gte': return docValue >= value;
            case 'lte': return docValue <= value;
            case 'contains':
              return String(docValue).toLowerCase().includes(String(value).toLowerCase());
            case 'startsWith':
              return String(docValue).toLowerCase().startsWith(String(value).toLowerCase());
            case 'endsWith':
              return String(docValue).toLowerCase().endsWith(String(value).toLowerCase());
            default: return true;
          }
        };
      }
    }

    throw new Error(`Unsupported filter expression: ${expr}`);
  }

  private parseValue(raw: string): any {
    // Remove surrounding quotes
    if ((raw.startsWith("'") && raw.endsWith("'")) ||
        (raw.startsWith('"') && raw.endsWith('"'))) {
      return raw.slice(1, -1);
    }

    // Check for boolean
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;

    // Check for number
    const num = Number(raw);
    if (!isNaN(num)) return num;

    // Default to string
    return raw;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }

  private applySort(docs: Doc[]): Doc[] {
    const sortField = this.getAttribute('sort');
    if (!sortField) return docs;

    const sortDir = this.getAttribute('sort-dir') || 'asc';
    const multiplier = sortDir === 'desc' ? -1 : 1;

    return [...docs].sort((a, b) => {
      const aVal = this.getNestedValue(a, sortField);
      const bVal = this.getNestedValue(b, sortField);

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * multiplier;
      }

      return (aVal < bVal ? -1 : 1) * multiplier;
    });
  }

  private applyPagination(docs: Doc[]): Doc[] {
    const limitAttr = this.getAttribute('limit');
    const offsetAttr = this.getAttribute('offset');

    const offset = offsetAttr ? parseInt(offsetAttr, 10) : 0;
    const limit = limitAttr ? parseInt(limitAttr, 10) : docs.length;

    return docs.slice(offset, offset + limit);
  }

  private renderDocs(docs: Doc[]): void {
    if (!this.resultsContainer || !this.template) {
      // No template, just dispatch event with data
      this.dispatchEvent(new CustomEvent('data', { detail: { docs } }));
      return;
    }

    this.resultsContainer.innerHTML = '';

    for (const doc of docs) {
      const fragment = this.template.content.cloneNode(true) as DocumentFragment;
      this.interpolateTemplate(fragment, doc);
      this.resultsContainer.appendChild(fragment);
    }
  }

  private interpolateTemplate(fragment: DocumentFragment, doc: Doc): void {
    // Walk all text nodes and interpolate {{field}} patterns
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      textNodes.push(node);
    }

    for (const textNode of textNodes) {
      if (textNode.textContent?.includes('{{')) {
        textNode.textContent = this.interpolateString(textNode.textContent, doc);
      }
    }

    // Also interpolate attributes
    const elements = fragment.querySelectorAll('*');
    for (const el of elements) {
      for (const attr of el.attributes) {
        if (attr.value.includes('{{')) {
          attr.value = this.interpolateString(attr.value, doc);
        }
      }
    }
  }

  private interpolateString(str: string, doc: Doc): string {
    return str.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
      const value = this.getNestedValue(doc, path);
      return value !== null && value !== undefined ? String(value) : '';
    });
  }

  // ========== Public API ==========

  /**
   * Get the bound collection
   */
  getCollection(): Collection | null {
    return this.collection;
  }

  /**
   * Manually trigger re-render
   */
  async refresh(): Promise<void> {
    await this.render();
  }

  /**
   * Get current query options
   */
  getQueryOptions(): QueryOptions {
    return {
      filter: this.getAttribute('filter') || undefined,
      sort: this.getAttribute('sort') || undefined,
      sortDir: (this.getAttribute('sort-dir') as 'asc' | 'desc') || undefined,
      limit: this.getAttribute('limit') ? parseInt(this.getAttribute('limit')!, 10) : undefined,
      offset: this.getAttribute('offset') ? parseInt(this.getAttribute('offset')!, 10) : undefined,
      search: this.getAttribute('search') || undefined,
    };
  }

  /**
   * Update query options programmatically
   */
  setQueryOptions(options: Partial<QueryOptions>): void {
    if (options.filter !== undefined) {
      options.filter ? this.setAttribute('filter', options.filter) : this.removeAttribute('filter');
    }
    if (options.sort !== undefined) {
      options.sort ? this.setAttribute('sort', options.sort) : this.removeAttribute('sort');
    }
    if (options.sortDir !== undefined) {
      options.sortDir ? this.setAttribute('sort-dir', options.sortDir) : this.removeAttribute('sort-dir');
    }
    if (options.limit !== undefined) {
      options.limit ? this.setAttribute('limit', String(options.limit)) : this.removeAttribute('limit');
    }
    if (options.offset !== undefined) {
      options.offset ? this.setAttribute('offset', String(options.offset)) : this.removeAttribute('offset');
    }
    if (options.search !== undefined) {
      options.search ? this.setAttribute('search', options.search) : this.removeAttribute('search');
    }
  }

  /**
   * Check if currently loading
   */
  isLoading(): boolean {
    return this.loading;
  }
}

// Register the custom element
if (typeof customElements !== 'undefined') {
  customElements.define('local-query', LocalQuery);
}
