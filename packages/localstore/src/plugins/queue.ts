/**
 * Offline queue system for sync plugins
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
}

export class OfflineQueue extends EventTarget {
  private queue: Map<string, QueueItem> = new Map();
  private processing = false;
  private destroyed = false;
  private options: Required<OfflineQueueOptions>;
  private retryTimer: number | null = null;
  
  constructor(options: OfflineQueueOptions = {}) {
    super();
    this.options = {
      maxRetries: options.maxRetries ?? 5,
      baseDelay: options.baseDelay ?? 1000,
      maxDelay: options.maxDelay ?? 30000,
      storage: options.storage ?? 'memory'
    };
  }
  
  get size(): number {
    return this.queue.size;
  }
  
  get syncing(): boolean {
    return this.processing;
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
  
  add(operation: 'put' | 'delete' | 'clear', collection: string, doc?: Doc, docId?: string): void {
    if (this.destroyed) return;
    
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
    
    this.dispatchEvent(new CustomEvent('queue:add', {
      detail: { item, queueSize: this.queue.size }
    }));
    
    // Start processing if not already running
    this.processQueue();
  }
  
  private async processQueue(): Promise<void> {
    if (this.processing || this.destroyed || this.queue.size === 0) {
      return;
    }
    
    this.processing = true;
    
    this.dispatchEvent(new CustomEvent('queue:flush', {
      detail: { queueSize: this.queue.size }
    }));
    
    const items = Array.from(this.queue.values())
      .sort((a, b) => a.timestamp - b.timestamp);
    
    for (const item of items) {
      if (this.destroyed) break;
      
      try {
        await this.processItem(item);
        this.queue.delete(item.id);
      } catch (error) {
        item.attempts++;
        item.lastError = (error as Error).message;
        
        if (item.attempts >= this.options.maxRetries) {
          // Remove failed item after max retries
          this.queue.delete(item.id);
          
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
      this.processQueue();
    }, delay) as any;
  }
  
  private async processItem(item: QueueItem): Promise<void> {
    // This method should be overridden by specific queue implementations
    // For now, we'll emit an event that sync plugins can listen to
    return new Promise((resolve, reject) => {
      const event = new CustomEvent('queue:process', {
        detail: { 
          item, 
          resolve, 
          reject,
          attempt: item.attempts + 1
        }
      });
      
      this.dispatchEvent(event);
      
      // If no one handled the event, reject
      setTimeout(() => {
        reject(new Error(`No handler for queue item: ${item.operation} on ${item.collection}`));
      }, 100);
    });
  }
  
  clear(): void {
    this.queue.clear();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
  
  destroy(): void {
    this.destroyed = true;
    this.processing = false;
    this.clear();
  }
  
  // Get items for inspection
  getItems(): QueueItem[] {
    return Array.from(this.queue.values());
  }
  
  // Remove specific item
  removeItem(id: string): boolean {
    return this.queue.delete(id);
  }
}