/**
 * <local-debug> Web Component
 *
 * Developer tools panel for inspecting LocalStore collections.
 * Provides collection browser, JSON editor, search, and sync status.
 *
 * @example
 * ```html
 * <!-- Add anywhere in your page -->
 * <local-debug></local-debug>
 *
 * <!-- With options -->
 * <local-debug position="bottom-left" collapsed></local-debug>
 * ```
 */

import { localCollection } from '../registry.ts';
import type { Doc, Collection } from '../types.ts';

export class LocalDebug extends HTMLElement {
  private panel: HTMLElement | null = null;
  private selectedCollection: string | null = null;
  private selectedDoc: Doc | null = null;
  private searchQuery = '';
  private isCollapsed = false;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private unsubscribeGlobal: (() => void) | null = null;
  private updateInterval: number | null = null;

  static get observedAttributes() {
    return ['position', 'collapsed'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.isCollapsed = this.hasAttribute('collapsed');
    this.render();
    this.setupEventListeners();
    this.startAutoRefresh();
  }

  disconnectedCallback() {
    if (this.unsubscribeGlobal) {
      this.unsubscribeGlobal();
    }
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue === newValue) return;

    if (name === 'collapsed') {
      this.isCollapsed = newValue !== null;
      this.updatePanelVisibility();
    } else if (name === 'position') {
      this.updatePosition();
    }
  }

  // ========== Rendering ==========

  private render(): void {
    if (!this.shadowRoot) return;

    const position = this.getAttribute('position') || 'bottom-right';
    const [vertical, horizontal] = position.split('-');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --debug-bg: #1e1e1e;
          --debug-border: #333;
          --debug-text: #d4d4d4;
          --debug-accent: #569cd6;
          --debug-success: #4ec9b0;
          --debug-warning: #dcdcaa;
          --debug-error: #f14c4c;
          --debug-header: #252526;
          --debug-hover: #2a2d2e;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12px;
        }

        .debug-panel {
          position: fixed;
          ${vertical}: 20px;
          ${horizontal}: 20px;
          width: 400px;
          max-height: 500px;
          background: var(--debug-bg);
          border: 1px solid var(--debug-border);
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          color: var(--debug-text);
          z-index: 99999;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .debug-panel.collapsed {
          width: auto;
          max-height: none;
        }

        .debug-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: var(--debug-header);
          border-bottom: 1px solid var(--debug-border);
          cursor: move;
          user-select: none;
        }

        .debug-title {
          font-weight: 600;
          color: var(--debug-accent);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .debug-title svg {
          width: 16px;
          height: 16px;
        }

        .debug-controls {
          display: flex;
          gap: 8px;
        }

        .debug-btn {
          background: none;
          border: none;
          color: var(--debug-text);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .debug-btn:hover {
          background: var(--debug-hover);
        }

        .debug-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .debug-content.hidden {
          display: none;
        }

        .debug-sidebar {
          width: 120px;
          border-right: 1px solid var(--debug-border);
          overflow-y: auto;
        }

        .debug-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .collection-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .collection-item {
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--debug-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .collection-item:hover {
          background: var(--debug-hover);
        }

        .collection-item.selected {
          background: var(--debug-accent);
          color: white;
        }

        .collection-count {
          background: var(--debug-header);
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 10px;
        }

        .collection-item.selected .collection-count {
          background: rgba(255,255,255,0.2);
        }

        .search-bar {
          padding: 8px;
          border-bottom: 1px solid var(--debug-border);
        }

        .search-input {
          width: 100%;
          padding: 6px 8px;
          background: var(--debug-header);
          border: 1px solid var(--debug-border);
          border-radius: 4px;
          color: var(--debug-text);
          font-size: 12px;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--debug-accent);
        }

        .doc-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .doc-item {
          padding: 8px;
          margin-bottom: 4px;
          background: var(--debug-header);
          border-radius: 4px;
          cursor: pointer;
          font-family: monospace;
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .doc-item:hover {
          background: var(--debug-hover);
        }

        .doc-item.selected {
          border: 1px solid var(--debug-accent);
        }

        .doc-editor {
          border-top: 1px solid var(--debug-border);
          max-height: 200px;
          overflow-y: auto;
        }

        .doc-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          background: var(--debug-header);
        }

        .doc-editor-content {
          padding: 8px;
        }

        .doc-editor textarea {
          width: 100%;
          min-height: 100px;
          background: var(--debug-header);
          border: 1px solid var(--debug-border);
          border-radius: 4px;
          color: var(--debug-text);
          font-family: monospace;
          font-size: 11px;
          padding: 8px;
          resize: vertical;
        }

        .doc-editor textarea:focus {
          outline: none;
          border-color: var(--debug-accent);
        }

        .status-bar {
          display: flex;
          justify-content: space-between;
          padding: 6px 12px;
          background: var(--debug-header);
          border-top: 1px solid var(--debug-border);
          font-size: 10px;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--debug-success);
        }

        .status-dot.offline {
          background: var(--debug-error);
        }

        .status-dot.syncing {
          background: var(--debug-warning);
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .empty-state {
          padding: 20px;
          text-align: center;
          color: #666;
        }

        .btn-small {
          padding: 4px 8px;
          background: var(--debug-accent);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        }

        .btn-small:hover {
          opacity: 0.9;
        }

        .btn-danger {
          background: var(--debug-error);
        }
      </style>

      <div class="debug-panel ${this.isCollapsed ? 'collapsed' : ''}">
        <div class="debug-header">
          <div class="debug-title">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            LocalStore
          </div>
          <div class="debug-controls">
            <button class="debug-btn" id="refresh-btn" title="Refresh">↻</button>
            <button class="debug-btn" id="toggle-btn" title="Toggle">${this.isCollapsed ? '▼' : '▲'}</button>
          </div>
        </div>

        <div class="debug-content ${this.isCollapsed ? 'hidden' : ''}">
          <div class="debug-sidebar">
            <ul class="collection-list" id="collection-list">
              <!-- Collections rendered here -->
            </ul>
          </div>

          <div class="debug-main">
            <div class="search-bar">
              <input type="text" class="search-input" id="search-input" placeholder="Search documents...">
            </div>

            <div class="doc-list" id="doc-list">
              <div class="empty-state">Select a collection</div>
            </div>

            <div class="doc-editor" id="doc-editor" style="display: none;">
              <div class="doc-editor-header">
                <span>Document Editor</span>
                <div>
                  <button class="btn-small" id="save-btn">Save</button>
                  <button class="btn-small btn-danger" id="delete-btn">Delete</button>
                </div>
              </div>
              <div class="doc-editor-content">
                <textarea id="doc-textarea"></textarea>
              </div>
            </div>
          </div>
        </div>

        <div class="status-bar ${this.isCollapsed ? 'hidden' : ''}">
          <div class="status-item">
            <span class="status-dot" id="online-status"></span>
            <span id="online-text">Online</span>
          </div>
          <div class="status-item">
            <span>Queue: <span id="queue-size">0</span></span>
          </div>
        </div>
      </div>
    `;

    this.panel = this.shadowRoot.querySelector('.debug-panel');
    this.renderCollections();
    this.updateStatus();
  }

  private setupEventListeners(): void {
    if (!this.shadowRoot) return;

    // Toggle button
    const toggleBtn = this.shadowRoot.getElementById('toggle-btn');
    toggleBtn?.addEventListener('click', () => this.toggle());

    // Refresh button
    const refreshBtn = this.shadowRoot.getElementById('refresh-btn');
    refreshBtn?.addEventListener('click', () => this.refresh());

    // Search input
    const searchInput = this.shadowRoot.getElementById('search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.renderDocuments();
    });

    // Save button
    const saveBtn = this.shadowRoot.getElementById('save-btn');
    saveBtn?.addEventListener('click', () => this.saveDocument());

    // Delete button
    const deleteBtn = this.shadowRoot.getElementById('delete-btn');
    deleteBtn?.addEventListener('click', () => this.deleteDocument());

    // Dragging
    const header = this.shadowRoot.querySelector('.debug-header');
    header?.addEventListener('mousedown', (e) => this.startDrag(e as MouseEvent));

    // Global change listener
    this.unsubscribeGlobal = () => {
      localCollection.removeEventListener('change', this.handleChange);
    };
    localCollection.addEventListener('change', this.handleChange);
  }

  private handleChange = (): void => {
    this.renderCollections();
    if (this.selectedCollection) {
      this.renderDocuments();
    }
  };

  private startAutoRefresh(): void {
    // Update status every second
    this.updateInterval = setInterval(() => {
      this.updateStatus();
    }, 1000) as any;
  }

  // ========== Collection Management ==========

  private renderCollections(): void {
    if (!this.shadowRoot) return;

    const list = this.shadowRoot.getElementById('collection-list');
    if (!list) return;

    const collections = localCollection.all();
    list.innerHTML = '';

    if (collections.size === 0) {
      list.innerHTML = '<li class="empty-state">No collections</li>';
      return;
    }

    collections.forEach((collection, name) => {
      const li = document.createElement('li');
      li.className = `collection-item ${name === this.selectedCollection ? 'selected' : ''}`;
      li.innerHTML = `
        <span>${name}</span>
        <span class="collection-count">--</span>
      `;

      li.addEventListener('click', () => this.selectCollection(name));
      list.appendChild(li);

      // Get count async
      collection.getAll().then(docs => {
        const countEl = li.querySelector('.collection-count');
        if (countEl) countEl.textContent = String(docs.length);
      });
    });
  }

  private async selectCollection(name: string): Promise<void> {
    this.selectedCollection = name;
    this.selectedDoc = null;
    this.renderCollections();
    await this.renderDocuments();
    this.hideEditor();
  }

  // ========== Document Management ==========

  private async renderDocuments(): Promise<void> {
    if (!this.shadowRoot || !this.selectedCollection) return;

    const list = this.shadowRoot.getElementById('doc-list');
    if (!list) return;

    const collection = localCollection.get(this.selectedCollection);
    if (!collection) {
      list.innerHTML = '<div class="empty-state">Collection not found</div>';
      return;
    }

    let docs = await collection.getAll();

    // Filter by search query
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      docs = docs.filter(doc =>
        JSON.stringify(doc).toLowerCase().includes(query)
      );
    }

    if (docs.length === 0) {
      list.innerHTML = '<div class="empty-state">No documents</div>';
      return;
    }

    list.innerHTML = '';

    for (const doc of docs) {
      const div = document.createElement('div');
      div.className = `doc-item ${this.selectedDoc?.id === doc.id ? 'selected' : ''}`;
      div.textContent = `${doc.id}: ${JSON.stringify(doc).slice(0, 50)}...`;
      div.addEventListener('click', () => this.selectDocument(doc));
      list.appendChild(div);
    }
  }

  private selectDocument(doc: Doc): void {
    this.selectedDoc = doc;
    this.renderDocuments();
    this.showEditor(doc);
  }

  private showEditor(doc: Doc): void {
    if (!this.shadowRoot) return;

    const editor = this.shadowRoot.getElementById('doc-editor');
    const textarea = this.shadowRoot.getElementById('doc-textarea') as HTMLTextAreaElement;

    if (editor && textarea) {
      editor.style.display = 'block';
      textarea.value = JSON.stringify(doc, null, 2);
    }
  }

  private hideEditor(): void {
    if (!this.shadowRoot) return;

    const editor = this.shadowRoot.getElementById('doc-editor');
    if (editor) {
      editor.style.display = 'none';
    }
  }

  private async saveDocument(): Promise<void> {
    if (!this.shadowRoot || !this.selectedCollection) return;

    const textarea = this.shadowRoot.getElementById('doc-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    try {
      const doc = JSON.parse(textarea.value);
      const collection = localCollection.get(this.selectedCollection);

      if (collection && doc.id) {
        await collection.put(doc);
        this.selectedDoc = doc;
        await this.renderDocuments();
      }
    } catch (error) {
      console.error('Invalid JSON:', error);
      alert('Invalid JSON');
    }
  }

  private async deleteDocument(): Promise<void> {
    if (!this.selectedCollection || !this.selectedDoc) return;

    if (!confirm(`Delete document "${this.selectedDoc.id}"?`)) return;

    const collection = localCollection.get(this.selectedCollection);
    if (collection) {
      await collection.delete(this.selectedDoc.id);
      this.selectedDoc = null;
      this.hideEditor();
      await this.renderDocuments();
    }
  }

  // ========== Status ==========

  private updateStatus(): void {
    if (!this.shadowRoot) return;

    const onlineStatus = this.shadowRoot.getElementById('online-status');
    const onlineText = this.shadowRoot.getElementById('online-text');
    const queueSize = this.shadowRoot.getElementById('queue-size');

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const queue = (localCollection as any).queue;

    if (onlineStatus) {
      onlineStatus.className = `status-dot ${isOnline ? '' : 'offline'} ${queue?.syncing ? 'syncing' : ''}`;
    }

    if (onlineText) {
      onlineText.textContent = isOnline ? (queue?.syncing ? 'Syncing...' : 'Online') : 'Offline';
    }

    if (queueSize) {
      queueSize.textContent = String(queue?.size ?? 0);
    }
  }

  // ========== Panel Controls ==========

  private toggle(): void {
    this.isCollapsed = !this.isCollapsed;

    if (this.isCollapsed) {
      this.setAttribute('collapsed', '');
    } else {
      this.removeAttribute('collapsed');
    }

    this.updatePanelVisibility();
  }

  private updatePanelVisibility(): void {
    if (!this.shadowRoot) return;

    const panel = this.shadowRoot.querySelector('.debug-panel');
    const content = this.shadowRoot.querySelector('.debug-content');
    const statusBar = this.shadowRoot.querySelector('.status-bar');
    const toggleBtn = this.shadowRoot.getElementById('toggle-btn');

    if (panel) {
      panel.classList.toggle('collapsed', this.isCollapsed);
    }

    if (content) {
      content.classList.toggle('hidden', this.isCollapsed);
    }

    if (statusBar) {
      statusBar.classList.toggle('hidden', this.isCollapsed);
    }

    if (toggleBtn) {
      toggleBtn.textContent = this.isCollapsed ? '▼' : '▲';
    }
  }

  private updatePosition(): void {
    if (!this.shadowRoot) return;

    const position = this.getAttribute('position') || 'bottom-right';
    const [vertical, horizontal] = position.split('-');

    const panel = this.shadowRoot.querySelector('.debug-panel') as HTMLElement;
    if (panel) {
      panel.style.top = vertical === 'top' ? '20px' : 'auto';
      panel.style.bottom = vertical === 'bottom' ? '20px' : 'auto';
      panel.style.left = horizontal === 'left' ? '20px' : 'auto';
      panel.style.right = horizontal === 'right' ? '20px' : 'auto';
    }
  }

  private startDrag(e: MouseEvent): void {
    if (!this.panel) return;

    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging || !this.panel) return;

      this.panel.style.left = `${e.clientX - this.dragOffset.x}px`;
      this.panel.style.top = `${e.clientY - this.dragOffset.y}px`;
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
    };

    const onMouseUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ========== Public API ==========

  /**
   * Refresh the debug panel
   */
  refresh(): void {
    this.renderCollections();
    if (this.selectedCollection) {
      this.renderDocuments();
    }
    this.updateStatus();
  }

  /**
   * Select a collection programmatically
   */
  select(collectionName: string): void {
    this.selectCollection(collectionName);
  }

  /**
   * Show the panel
   */
  show(): void {
    this.isCollapsed = false;
    this.removeAttribute('collapsed');
    this.updatePanelVisibility();
  }

  /**
   * Hide the panel
   */
  hide(): void {
    this.isCollapsed = true;
    this.setAttribute('collapsed', '');
    this.updatePanelVisibility();
  }
}

// Register the custom element
if (typeof customElements !== 'undefined') {
  customElements.define('local-debug', LocalDebug);
}
