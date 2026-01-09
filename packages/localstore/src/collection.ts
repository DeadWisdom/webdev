/**
 * Collection class - Core of LocalStore
 */

import type { Doc, Plugin, MethodName, WriteOptions, SearchOptions, ChangeEvent } from './types.ts';

export class Collection extends EventTarget {
  name: string;
  private plugins: Plugin[];
  private chains: Map<MethodName, Function>;
  private _subscriberCount: number = 0;

  constructor(name: string, plugins: Plugin[]) {
    super();
    this.name = name;
    this.plugins = plugins;
    this.chains = this.buildChains();
  }

  get subscriberCount(): number {
    return this._subscriberCount;
  }
  
  private buildChains(): Map<MethodName, Function> {
    const methods: MethodName[] = ['get', 'getAll', 'put', 'delete', 'clear', 'search'];
    const chains = new Map<MethodName, Function>();
    
    for (const method of methods) {
      // Get plugins that implement this method, in order
      const handlers = this.plugins
        .filter(p => typeof p[method] === 'function')
        .map(p => p[method]!.bind(p));
      
      if (handlers.length === 0) {
        // No plugin provides this method
        chains.set(method, async () => {
          throw new Error(`No plugin provides '${method}' method for collection '${this.name}'`);
        });
        continue;
      }
      
      // Build chain: each handler calls next to continue
      // The chain is built right-to-left, so the first plugin runs first
      const chain = handlers.reduceRight(
        (next: Function, handler: Function) => {
          return async (...args: any[]) => {
            // Handler receives next function as first argument, then the actual arguments
            return handler(next, ...args);
          };
        },
        // Terminal function - should never be called if plugins are properly terminal
        (async () => {
          throw new Error(`Unexpected end of chain for '${method}' in collection '${this.name}'`);
        }) as Function
      );
      
      chains.set(method, chain);
    }
    
    return chains;
  }
  
  async get(id: string): Promise<Doc | undefined> {
    const chain = this.chains.get('get');
    if (!chain) throw new Error(`Method 'get' not available`);
    return chain(id);
  }
  
  async getAll(): Promise<Doc[]> {
    const chain = this.chains.get('getAll');
    if (!chain) throw new Error(`Method 'getAll' not available`);
    return chain();
  }
  
  async put(doc: Doc, opts?: WriteOptions): Promise<void> {
    const chain = this.chains.get('put');
    if (!chain) throw new Error(`Method 'put' not available`);
    
    await chain(doc, opts);
    
    // Emit change event unless it's a remote change
    if (!opts?.remote) {
      this.dispatchEvent(new CustomEvent('change', {
        detail: {
          collection: this.name,
          op: 'put',
          id: doc.id,
          doc,
          timestamp: Date.now(),
        }
      }) as ChangeEvent);
    }
  }
  
  async delete(id: string, opts?: WriteOptions): Promise<void> {
    const chain = this.chains.get('delete');
    if (!chain) throw new Error(`Method 'delete' not available`);
    
    await chain(id, opts);
    
    // Emit change event unless it's a remote change
    if (!opts?.remote) {
      this.dispatchEvent(new CustomEvent('change', {
        detail: {
          collection: this.name,
          op: 'delete',
          id,
          timestamp: Date.now(),
        }
      }) as ChangeEvent);
    }
  }
  
  async clear(): Promise<void> {
    const chain = this.chains.get('clear');
    if (!chain) throw new Error(`Method 'clear' not available`);
    
    await chain();
    
    this.dispatchEvent(new CustomEvent('change', {
      detail: {
        collection: this.name,
        op: 'clear',
        timestamp: Date.now(),
      }
    }) as ChangeEvent);
  }
  
  async search(query: string, opts?: SearchOptions): Promise<Doc[]> {
    const chain = this.chains.get('search');
    if (!chain) throw new Error(`Method 'search' not available`);
    return chain(query, opts);
  }
  
  subscribe(callback: (docs: Doc[]) => void): () => void {
    const handler = async () => {
      try {
        const docs = await this.getAll();
        callback(docs);
      } catch (err) {
        console.error(`Error in subscribe handler for collection '${this.name}':`, err);
      }
    };

    this.addEventListener('change', handler);
    this._subscriberCount++;
    this.dispatchEvent(new CustomEvent('subscribers', {
      detail: { count: this._subscriberCount }
    }));

    handler(); // Initial call

    // Return unsubscribe function
    return () => {
      this.removeEventListener('change', handler);
      this._subscriberCount--;
      this.dispatchEvent(new CustomEvent('subscribers', {
        detail: { count: this._subscriberCount }
      }));
    };
  }
  
  async close(): Promise<void> {
    // Destroy all plugins
    for (const plugin of this.plugins) {
      try {
        await plugin.destroy?.();
      } catch (err) {
        console.error(`Error destroying plugin '${plugin.name}':`, err);
      }
    }
  }
  
  // Helper method to install plugins after construction
  async installPlugins(): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.install?.(this);
      } catch (err) {
        console.error(`Error installing plugin '${plugin.name}':`, err);
        throw err;
      }
    }
  }
}