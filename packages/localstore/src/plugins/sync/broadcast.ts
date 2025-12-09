/**
 * Broadcast plugin - cross-tab sync via BroadcastChannel
 */

import type { Plugin, Collection, ChangeEvent } from '../../types.ts';

export interface BroadcastOptions {
  channel?: string;
}

export function broadcast(options: BroadcastOptions = {}): Plugin {
  let channel: BroadcastChannel | null = null;
  let collection: Collection | null = null;
  const tabId = crypto.randomUUID();
  
  return {
    name: 'broadcast',
    
    install(col: Collection) {
      collection = col;
      
      // Use custom channel name or default to collection name
      const channelName = options.channel ?? `localstore:${col.name}`;
      
      // Check if BroadcastChannel is available
      if (typeof BroadcastChannel === 'undefined') {
        console.warn('BroadcastChannel not available, cross-tab sync disabled');
        return;
      }
      
      channel = new BroadcastChannel(channelName);
      
      // Local changes → other tabs
      const changeHandler = async (e: Event) => {
        const changeEvent = e as ChangeEvent;
        const detail = changeEvent.detail;
        
        // Don't broadcast changes that came from other tabs
        if (detail.source === 'broadcast') return;
        
        // Send change to other tabs
        channel?.postMessage({
          ...detail,
          tabId,
          timestamp: Date.now()
        });
      };
      
      col.addEventListener('change', changeHandler);
      
      // Other tabs → local
      channel.onmessage = async (e) => {
        // Ignore our own messages
        if (e.data.tabId === tabId) return;
        
        const { op, id, doc } = e.data;
        
        try {
          // Apply the change locally
          if (op === 'put' && doc) {
            await collection.put(doc, { remote: true });
          } else if (op === 'delete' && id) {
            await collection.delete(id, { remote: true });
          } else if (op === 'clear') {
            await collection.clear();
          }
          
          // Emit event so subscribers update (mark as broadcast source)
          collection.dispatchEvent(new CustomEvent('change', {
            detail: { 
              ...e.data,
              source: 'broadcast'
            }
          }) as ChangeEvent);
          
        } catch (error) {
          console.error(`Broadcast plugin error applying ${op}:`, error);
        }
      };
      
      // Handle channel errors
      channel.addEventListener('messageerror', (e) => {
        console.error('Broadcast channel message error:', e);
      });
    },
    
    destroy() {
      if (channel) {
        channel.close();
        channel = null;
      }
      collection = null;
    }
  };
}