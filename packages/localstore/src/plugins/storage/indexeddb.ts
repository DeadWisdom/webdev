/**
 * IndexedDB storage plugin - persistent browser storage
 */

import type { Plugin, Doc } from '../../types.ts';

export interface IndexedDBOptions {
  database?: string;
  version?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

interface OpenDatabaseResult {
  db: IDBDatabase;
  version: number;
}

export function indexedDB(options: IndexedDBOptions = {}): Plugin {
  const dbName = options.database ?? 'localstore';
  const retryAttempts = options.retryAttempts ?? 3;
  const retryDelay = options.retryDelay ?? 100;
  
  let db: IDBDatabase | null = null;
  let storeName: string = '';
  
  return {
    name: 'indexedDB',
    
    async install(collection) {
      storeName = collection.name;
      const result = await openDatabase(dbName, storeName, options.version);
      db = result.db;
      
      // Handle database close/error events
      db.addEventListener('close', () => {
        console.warn(`IndexedDB '${dbName}' was closed unexpectedly`);
        db = null;
      });
      
      db.addEventListener('error', (event) => {
        console.error(`IndexedDB '${dbName}' error:`, event);
      });
      
      db.addEventListener('versionchange', () => {
        console.warn(`IndexedDB '${dbName}' version change detected, closing connection`);
        db?.close();
        db = null;
      });
    },
    
    async get(_next, id: string): Promise<Doc | undefined> {
      return retryOperation(async () => {
        await ensureConnection();
        return new Promise<Doc | undefined>((resolve, reject) => {
          if (!db) {
            reject(new Error('Database not available'));
            return;
          }
          
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const request = store.get(id);
          
          request.onsuccess = () => resolve(request.result || undefined);
          request.onerror = () => reject(request.error);
          
          tx.onerror = () => reject(tx.error);
        });
      });
    },
    
    async getAll(_next): Promise<Doc[]> {
      return retryOperation(async () => {
        await ensureConnection();
        return new Promise<Doc[]>((resolve, reject) => {
          if (!db) {
            reject(new Error('Database not available'));
            return;
          }
          
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const request = store.getAll();
          
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
          
          tx.onerror = () => reject(tx.error);
        });
      });
    },
    
    async put(_next, doc: Doc): Promise<void> {
      return retryOperation(async () => {
        await ensureConnection();
        return new Promise<void>((resolve, reject) => {
          if (!db) {
            reject(new Error('Database not available'));
            return;
          }
          
          if (!doc.id) {
            reject(new Error('Document must have an id field'));
            return;
          }
          
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const request = store.put(doc);
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          
          tx.onerror = () => reject(tx.error);
        });
      });
    },
    
    async delete(_next, id: string): Promise<void> {
      return retryOperation(async () => {
        await ensureConnection();
        return new Promise<void>((resolve, reject) => {
          if (!db) {
            reject(new Error('Database not available'));
            return;
          }
          
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const request = store.delete(id);
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          
          tx.onerror = () => reject(tx.error);
        });
      });
    },
    
    async clear(_next): Promise<void> {
      return retryOperation(async () => {
        await ensureConnection();
        return new Promise<void>((resolve, reject) => {
          if (!db) {
            reject(new Error('Database not available'));
            return;
          }
          
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const request = store.clear();
          
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          
          tx.onerror = () => reject(tx.error);
        });
      });
    },
    
    async destroy() {
      if (db) {
        db.close();
        db = null;
      }
    }
  };
  
  // Ensure database connection is available
  async function ensureConnection(): Promise<void> {
    if (!db || db.readyState !== 'done') {
      const result = await openDatabase(dbName, storeName, options.version);
      db = result.db;
    }
  }
  
  // Retry operation with exponential backoff
  async function retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry certain errors
        if (
          lastError.name === 'ConstraintError' ||
          lastError.name === 'DataError' ||
          lastError.name === 'InvalidStateError'
        ) {
          throw lastError;
        }
        
        // Don't retry on last attempt
        if (attempt === retryAttempts) {
          break;
        }
        
        // Wait before retrying with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Reset connection for retry
        if (db) {
          db.close();
          db = null;
        }
      }
    }
    
    throw lastError!;
  }
}

/**
 * Opens IndexedDB database and ensures object store exists
 */
async function openDatabase(
  dbName: string,
  storeName: string,
  version?: number
): Promise<OpenDatabaseResult> {
  const idb = globalThis.indexedDB;
  if (!idb) {
    throw new Error('IndexedDB is not available in this environment');
  }

  return new Promise((resolve, reject) => {
    // First, open without version to check current version
    const checkReq = idb.open(dbName);
    
    checkReq.onerror = () => reject(checkReq.error);
    
    checkReq.onsuccess = () => {
      const currentDb = checkReq.result;
      const currentVersion = currentDb.version;
      const hasStore = currentDb.objectStoreNames.contains(storeName);
      currentDb.close();
      
      // Determine target version
      const targetVersion = version ?? (hasStore ? currentVersion : currentVersion + 1);

      // Open with correct version
      const openReq = idb.open(dbName, targetVersion);
      
      openReq.onerror = () => reject(openReq.error);
      
      openReq.onblocked = () => {
        reject(new Error(`IndexedDB '${dbName}' is blocked by another connection`));
      };
      
      openReq.onupgradeneeded = (event) => {
        const db = openReq.result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      
      openReq.onsuccess = () => {
        const db = openReq.result;
        
        // Verify store exists
        if (!db.objectStoreNames.contains(storeName)) {
          db.close();
          reject(new Error(`Object store '${storeName}' was not created`));
          return;
        }
        
        resolve({ db, version: db.version });
      };
    };
  });
}