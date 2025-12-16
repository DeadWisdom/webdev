/**
 * Offline queue system for sync plugins
 * Supports both memory and IndexedDB persistence
 */

import type { Doc } from '../types.ts';

export interface QueueItem {
  id: string;
  collection: string;
  operation: 'put' | 'delete' | 'clear';
  doc?: Doc;
  docId?: string;
  timestamp: number;
  attempts: number;
  lastError?: string;
}

export interface OfflineQueueOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  storage?: 'memory' | 'indexeddb';
  dbName?: string;
  storeName?: string;
  autoProcess?: boolean;  // Auto-process when online (default: true)
}

const DEFAULT_DB_NAME = 'localstore-queue';
const DEFAULT_STORE_NAME = 'queue';

export class OfflineQueue extends EventTarget {
  private queue: Map<string, QueueItem> = new Map();
  private processing = false;
  private paused = false;
  private destroyed = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private options: Required<OfflineQueueOptions>;
  private retryTimer: number | null = null;
  private db: IDBDatabase | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor(options: OfflineQueueOptions = {}) {
    super();
    this.options = {
      maxRetries: options.maxRetries ?? 5,
      baseDelay: options.baseDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000,
      storage: options.storage ?? 'memory',
      dbName: options.dbName ?? DEFAULT_DB_NAME,
      storeName: options.storeName ?? DEFAULT_STORE_NAME,
      autoProcess: options.autoProcess ?? true
    };

    // Set up network status listeners
    if (this.options.autoProcess && typeof window !== 'undefined') {
      this.setupNetworkListeners();
    }
  }

  /**
   * Initialize the queue (required for IndexedDB storage)
   * For memory storage, this is a no-op
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    await this.initPromise;
    this.initialized = true;
  }

  private async doInit(): Promise<void> {
    if (this.options.storage === 'indexeddb') {
      await this.openDatabase();
      await this.loadFromIndexedDB();
    }

    this.dispatchEvent(new CustomEvent('queue:ready', {
      detail: { queueSize: this.queue.size }
    }));
  }

  private setupNetworkListeners(): void {
    this.onlineHandler = () => {
      this.dispatchEvent(new CustomEvent('queue:online', {
        detail: { queueSize: this.queue.size }
      }));

      // Auto-process queue when back online
      if (!this.paused && this.queue.size > 0) {
        this.processQueue();
      }
    };

    this.offlineHandler = () => {
      this.dispatchEvent(new CustomEvent('queue:offline', {
        detail: { queueSize: this.queue.size }
      }));
    };

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  // ========== Database Operations ==========

  private async openDatabase(): Promise<void> {
    const idb = globalThis.indexedDB;
    if (!idb) {
      console.warn('IndexedDB not available, falling back to memory storage');
      this.options.storage = 'memory';
      return;
    }

    return new Promise((resolve, reject) => {
      const request = idb.open(this.options.dbName, 1);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.options.storeName)) {
          db.createObjectStore(this.options.storeName, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;

        this.db.addEventListener('close', () => {
          this.db = null;
        });

        resolve();
      };
    });
  }

  private async loadFromIndexedDB(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.options.storeName, 'readonly');
      const store = tx.objectStore(this.options.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result as QueueItem[];
        for (const item of items) {
          this.queue.set(item.id, item);
        }
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async saveToIndexedDB(item: QueueItem): Promise<void> {
    if (!this.db || this.options.storage !== 'indexeddb') return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.options.storeName, 'readwrite');
      const store = tx.objectStore(this.options.storeName);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromIndexedDB(id: string): Promise<void> {
    if (!this.db || this.options.storage !== 'indexeddb') return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.options.storeName, 'readwrite');
      const store = tx.objectStore(this.options.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async clearIndexedDB(): Promise<void> {
    if (!this.db || this.options.storage !== 'indexeddb') return;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.options.storeName, 'readwrite');
      const store = tx.objectStore(this.options.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ========== Public Properties ==========

  get size(): number {
    return this.queue.size;
  }

  get syncing(): boolean {
    return this.processing;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  get stalledSince(): Date | null {
    if (this.queue.size === 0) return null;

    const oldestItem = Array.from(this.queue.values())
      .sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!oldestItem) return null;

    // Consider stalled if oldest item is > 5 minutes old and has failed attempts
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    if (oldestItem.timestamp < fiveMinutesAgo && oldestItem.attempts > 0) {
      return new Date(oldestItem.timestamp);
    }

    return null;
  }

  // ========== Queue Operations ==========

  async add(operation: 'put' | 'delete' | 'clear', collection: string, doc?: Doc, docId?: string): Promise<void> {
    if (this.destroyed) return;

    // Ensure initialized for IndexedDB storage
    if (this.options.storage === 'indexeddb' && !this.initialized) {
      await this.init();
    }

    const id = `${collection}-${operation}-${docId || doc?.id || Date.now()}`;
    const item: QueueItem = {
      id,
      collection,
      operation,
      doc,
      docId,
      timestamp: Date.now(),
      attempts: 0
    };

    this.queue.set(id, item);
    await this.saveToIndexedDB(item);

    this.dispatchEvent(new CustomEvent('queue:add', {
      detail: { item, queueSize: this.queue.size }
    }));

    // Start processing if not paused and online
    if (!this.paused && this.isOnline) {
      this.processQueue();
    }
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.paused = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.dispatchEvent(new CustomEvent('queue:pause', {
      detail: { queueSize: this.queue.size }
    }));
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.paused = false;
    this.dispatchEvent(new CustomEvent('queue:resume', {
      detail: { queueSize: this.queue.size }
    }));

    if (this.isOnline && this.queue.size > 0) {
      this.processQueue();
    }
  }

  /**
   * Retry all failed items immediately
   */
  async retryAll(): Promise<void> {
    // Reset attempts for all items
    for (const item of this.queue.values()) {
      item.attempts = 0;
      item.lastError = undefined;
      await this.saveToIndexedDB(item);
    }

    this.dispatchEvent(new CustomEvent('queue:retry', {
      detail: { queueSize: this.queue.size }
    }));

    if (!this.paused && this.isOnline) {
      this.processQueue();
    }
  }

  /**
   * Retry a specific item
   */
  async retryItem(id: string): Promise<boolean> {
    const item = this.queue.get(id);
    if (!item) return false;

    item.attempts = 0;
    item.lastError = undefined;
    await this.saveToIndexedDB(item);

    if (!this.paused && this.isOnline) {
      this.processQueue();
    }

    return true;
  }

  /**
   * Force process the queue (ignores pause state)
   */
  async flush(): Promise<void> {
    const wasPaused = this.paused;
    this.paused = false;
    await this.processQueue();
    this.paused = wasPaused;
  }

  // ========== Queue Processing ==========

  private async processQueue(): Promise<void> {
    if (this.processing || this.destroyed || this.queue.size === 0 || this.paused) {
      return;
    }

    this.processing = true;

    this.dispatchEvent(new CustomEvent('queue:flush', {
      detail: { queueSize: this.queue.size }
    }));

    const items = Array.from(this.queue.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    for (const item of items) {
      if (this.destroyed || this.paused) break;

      // Check if still online before each item
      if (!this.isOnline) {
        this.dispatchEvent(new CustomEvent('queue:offline', {
          detail: { queueSize: this.queue.size }
        }));
        break;
      }

      try {
        await this.processItem(item);
        this.queue.delete(item.id);
        await this.deleteFromIndexedDB(item.id);

        this.dispatchEvent(new CustomEvent('queue:success', {
          detail: { item, queueSize: this.queue.size }
        }));
      } catch (error) {
        item.attempts++;
        item.lastError = (error as Error).message;
        await this.saveToIndexedDB(item);

        if (item.attempts >= this.options.maxRetries) {
          // Remove failed item after max retries
          this.queue.delete(item.id);
          await this.deleteFromIndexedDB(item.id);

          this.dispatchEvent(new CustomEvent('queue:failed', {
            detail: { item, error }
          }));
        } else {
          // Schedule retry with exponential backoff
          this.scheduleRetry(item);
        }
      }
    }

    this.processing = false;

    if (this.queue.size === 0) {
      this.dispatchEvent(new CustomEvent('queue:drain', {
        detail: {}
      }));
    } else {
      // Check for stalled items
      const stalled = this.stalledSince;
      if (stalled) {
        this.dispatchEvent(new CustomEvent('queue:stalled', {
          detail: {
            queueSize: this.queue.size,
            stalledSince: stalled,
            oldestAge: Date.now() - stalled.getTime()
          }
        }));
      }
    }
  }

  private scheduleRetry(item: QueueItem): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    // Exponential backoff: baseDelay * 2^attempts, capped at maxDelay
    const delay = Math.min(
      this.options.baseDelay * Math.pow(2, item.attempts - 1),
      this.options.maxDelay
    );

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.paused) {
        this.processQueue();
      }
    }, delay) as any;
  }

  private async processItem(item: QueueItem): Promise<void> {
    // Emit event for sync plugins to handle
    return new Promise((resolve, reject) => {
      let handled = false;

      const event = new CustomEvent('queue:process', {
        detail: {
          item,
          resolve: () => {
            handled = true;
            resolve();
          },
          reject: (error: Error) => {
            handled = true;
            reject(error);
          },
          attempt: item.attempts + 1
        }
      });

      this.dispatchEvent(event);

      // If no one handled the event, reject after timeout
      setTimeout(() => {
        if (!handled) {
          reject(new Error(`No handler for queue item: ${item.operation} on ${item.collection}`));
        }
      }, 100);
    });
  }

  // ========== Cleanup ==========

  async clear(): Promise<void> {
    this.queue.clear();
    await this.clearIndexedDB();

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.dispatchEvent(new CustomEvent('queue:clear', {
      detail: {}
    }));
  }

  destroy(): void {
    this.destroyed = true;
    this.processing = false;
    this.paused = false;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Remove network listeners
    if (typeof window !== 'undefined') {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
      }
      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler);
      }
    }

    // Close database
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.queue.clear();
  }

  // ========== Inspection ==========

  /**
   * Get all items for inspection
   */
  getItems(): QueueItem[] {
    return Array.from(this.queue.values());
  }

  /**
   * Get a specific item
   */
  getItem(id: string): QueueItem | undefined {
    return this.queue.get(id);
  }

  /**
   * Remove a specific item
   */
  async removeItem(id: string): Promise<boolean> {
    const existed = this.queue.delete(id);
    if (existed) {
      await this.deleteFromIndexedDB(id);
    }
    return existed;
  }

  /**
   * Get items by collection
   */
  getItemsByCollection(collection: string): QueueItem[] {
    return Array.from(this.queue.values())
      .filter(item => item.collection === collection);
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    size: number;
    syncing: boolean;
    paused: boolean;
    online: boolean;
    stalledSince: Date | null;
    byCollection: Record<string, number>;
    byOperation: Record<string, number>;
    failedCount: number;
  } {
    const byCollection: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    let failedCount = 0;

    for (const item of this.queue.values()) {
      byCollection[item.collection] = (byCollection[item.collection] || 0) + 1;
      byOperation[item.operation] = (byOperation[item.operation] || 0) + 1;
      if (item.attempts > 0) failedCount++;
    }

    return {
      size: this.queue.size,
      syncing: this.processing,
      paused: this.paused,
      online: this.isOnline,
      stalledSince: this.stalledSince,
      byCollection,
      byOperation,
      failedCount
    };
  }
}
