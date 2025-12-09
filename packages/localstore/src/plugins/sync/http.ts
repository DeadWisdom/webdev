/**
 * HTTP sync plugin - synchronize with REST APIs
 */

import type { Plugin, Collection, ChangeEvent, Doc } from '../../types.ts';
import { OfflineQueue } from '../queue.ts';
import { setSharedQueue } from '../../registry.ts';

export interface HttpSyncOptions {
  endpoint: string;
  poll?: number;         // Polling interval in ms, 0 = disabled
  headers?: Record<string, string>;
  push?: boolean;        // Push changes to server (default: true)
  pull?: boolean;        // Pull changes from server (default: true)
  timeout?: number;      // Request timeout in ms
  retryAttempts?: number;
  retryDelay?: number;
  conflictResolution?: 'local-wins' | 'server-wins' | 'merge' | 'error';
}

// Remove unused interface

export function httpSync(options: string | HttpSyncOptions): Plugin {
  const config: Required<HttpSyncOptions> = {
    endpoint: typeof options === 'string' ? options : options.endpoint,
    poll: typeof options === 'string' ? 0 : (options.poll ?? 0),
    headers: typeof options === 'string' ? {} : (options.headers ?? {}),
    push: typeof options === 'string' ? true : (options.push ?? true),
    pull: typeof options === 'string' ? true : (options.pull ?? true),
    timeout: typeof options === 'string' ? 30000 : (options.timeout ?? 30000),
    retryAttempts: typeof options === 'string' ? 3 : (options.retryAttempts ?? 3),
    retryDelay: typeof options === 'string' ? 1000 : (options.retryDelay ?? 1000),
    conflictResolution: typeof options === 'string' ? 'server-wins' : (options.conflictResolution ?? 'server-wins')
  };
  
  let collection: Collection | null = null;
  let queue: OfflineQueue | null = null;
  let pollInterval: number | null = null;
  let lastETag: string | null = null;
  let lastModified: number | null = null;
  let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  
  return {
    name: 'httpSync',
    
    async install(col: Collection) {
      collection = col;
      
      // Initialize offline queue
      queue = new OfflineQueue({
        maxRetries: config.retryAttempts,
        baseDelay: config.retryDelay,
        maxDelay: config.retryDelay * 10
      });
      
      // Set as shared queue for global access
      setSharedQueue(queue);
      
      // Handle queue processing
      queue.addEventListener('queue:process', async (e: Event) => {
        const { item, resolve, reject } = (e as CustomEvent).detail;
        
        try {
          await processQueueItem(item);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      // Listen for network status changes
      if (typeof window !== 'undefined') {
        const onlineHandler = () => {
          isOnline = true;
          // Trigger queue processing when back online
          if (queue && queue.size > 0) {
            console.log('Network restored, processing queued operations');
          }
        };
        
        const offlineHandler = () => {
          isOnline = false;
          console.log('Network lost, operations will be queued');
        };
        
        window.addEventListener('online', onlineHandler);
        window.addEventListener('offline', offlineHandler);
      }
      
      // Initial pull if enabled
      if (config.pull) {
        try {
          await pullFromServer();
        } catch (error) {
          console.warn('HTTP sync: Initial pull failed:', error);
        }
      }
      
      // Set up polling if enabled
      if (config.poll > 0 && config.pull) {
        pollInterval = setInterval(async () => {
          try {
            await pullFromServer();
          } catch (error) {
            console.warn('HTTP sync: Poll failed:', error);
          }
        }, config.poll) as any;
      }
      
      // Set up push sync if enabled
      if (config.push) {
        const changeHandler = async (e: Event) => {
          const changeEvent = e as ChangeEvent;
          const { op, id, doc, remote } = changeEvent.detail;
          
          // Don't sync remote changes back to server
          if (remote) return;
          
          try {
            if (isOnline) {
              await pushToServer(op, id, doc);
            } else {
              // Queue for later when online
              queue?.add(op, collection!.name, doc, id);
            }
          } catch (error) {
            console.warn(`HTTP sync: Push failed, queuing operation:`, error);
            // Queue failed operations for retry
            queue?.add(op, collection!.name, doc, id);
          }
        };
        
        col.addEventListener('change', changeHandler);
      }
    },
    
    async destroy() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      
      if (queue) {
        queue.destroy();
        queue = null;
      }
      
      collection = null;
    }
  };
  
  // Push operation to server
  async function pushToServer(operation: string, id?: string, doc?: Doc): Promise<void> {
    if (!collection) throw new Error('Collection not initialized');
    
    const url = id ? `${config.endpoint}/${id}` : config.endpoint;
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers
    };
    
    let method: string;
    let body: string | undefined;
    
    switch (operation) {
      case 'put':
        method = 'PUT';
        body = JSON.stringify(doc);
        break;
      case 'delete':
        method = 'DELETE';
        break;
      case 'clear':
        method = 'DELETE';
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Emit sync event
      collection.dispatchEvent(new CustomEvent('sync:complete', {
        detail: {
          collection: collection.name,
          adapter: 'http',
          operation,
          id
        }
      }));
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Emit sync error
      collection.dispatchEvent(new CustomEvent('sync:error', {
        detail: {
          collection: collection.name,
          adapter: 'http',
          operation,
          error
        }
      }));
      
      throw error;
    }
  }
  
  // Pull data from server
  async function pullFromServer(): Promise<void> {
    if (!collection) return;
    
    const headers: Record<string, string> = {
      ...config.headers
    };
    
    // Add conditional headers if we have them
    if (lastETag) {
      headers['If-None-Match'] = lastETag;
    }
    if (lastModified) {
      headers['If-Modified-Since'] = new Date(lastModified).toUTCString();
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    try {
      const response = await fetch(config.endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle 304 Not Modified
      if (response.status === 304) {
        return; // No changes
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Update cache headers
      const etag = response.headers.get('ETag');
      const lastModifiedHeader = response.headers.get('Last-Modified');
      
      if (etag) lastETag = etag;
      if (lastModifiedHeader) lastModified = new Date(lastModifiedHeader).getTime();
      
      const data = await response.json();
      const docs = Array.isArray(data) ? data : (data.data || []);
      
      // Apply changes locally
      let changeCount = 0;
      for (const doc of docs) {
        if (doc && doc.id) {
          const existing = await collection.get(doc.id);
          
          if (!existing) {
            // New document
            await collection.put(doc, { remote: true });
            changeCount++;
          } else {
            // Check for conflicts
            const shouldUpdate = await resolveConflict(existing, doc);
            if (shouldUpdate) {
              await collection.put(doc, { remote: true });
              changeCount++;
            }
          }
        }
      }
      
      // Emit sync complete event
      collection.dispatchEvent(new CustomEvent('sync:complete', {
        detail: {
          collection: collection.name,
          adapter: 'http',
          operation: 'pull',
          count: changeCount
        }
      }));
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Don't log timeout errors when offline
      if (!isOnline && (error as Error).name === 'AbortError') {
        return;
      }
      
      collection.dispatchEvent(new CustomEvent('sync:error', {
        detail: {
          collection: collection.name,
          adapter: 'http',
          operation: 'pull',
          error
        }
      }));
      
      throw error;
    }
  }
  
  // Resolve conflicts between local and server documents
  async function resolveConflict(local: Doc, remote: Doc): Promise<boolean> {
    const localTime = (local.updatedAt || local.lastModified || 0) as number;
    const remoteTime = (remote.updatedAt || remote.lastModified || 0) as number;
    
    switch (config.conflictResolution) {
      case 'local-wins':
        return false; // Keep local version
        
      case 'server-wins':
        return true; // Use server version
        
      case 'merge':
        // Simple merge: server wins for conflicts, but keep local-only fields
        return true; // For now, just use server version
        
      case 'error':
        if (collection) {
          collection.dispatchEvent(new CustomEvent('sync:conflict', {
            detail: {
              collection: collection.name,
              id: local.id,
              local,
              remote,
              resolution: 'error'
            }
          }));
        }
        throw new Error(`Conflict detected for document ${local.id}`);
        
      default:
        return remoteTime > localTime; // Timestamp-based resolution
    }
  }
  
  // Process queued operations
  async function processQueueItem(item: any): Promise<void> {
    await pushToServer(item.operation, item.docId, item.doc);
  }
}