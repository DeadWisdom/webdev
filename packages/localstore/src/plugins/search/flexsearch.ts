/**
 * FlexSearch plugin - full-text search functionality
 */

import FlexSearch from 'flexsearch';
import type { Plugin, Doc, SearchOptions, Collection, ChangeEvent } from '../../types.ts';

const { Document } = FlexSearch;

export interface FlexSearchOptions {
  fields: string[];
  tokenize?: 'strict' | 'forward' | 'reverse' | 'full';
  resolution?: number;
  depth?: number;
  preset?: 'memory' | 'performance' | 'match' | 'score' | 'default';
  cache?: boolean | number;
  suggest?: boolean;
}

export function flexSearch(options: string[] | FlexSearchOptions): Plugin {
  // Normalize options
  const config: FlexSearchOptions = Array.isArray(options) 
    ? { fields: options }
    : options;
    
  if (!config.fields || config.fields.length === 0) {
    throw new Error('FlexSearch plugin requires at least one field to index');
  }
  
  let index: any | null = null;
  let collection: Collection | null = null;
  
  return {
    name: 'flexSearch',
    
    async install(col: Collection) {
      collection = col;
      
      // Initialize FlexSearch document index
      const indexConfig: any = {
        // Document structure
        document: {
          id: 'id',
          index: config.fields,
        },
        
        // Search configuration
        tokenize: config.tokenize ?? 'forward',
        resolution: config.resolution ?? 9,
        cache: config.cache ?? 100,
        suggest: config.suggest ?? true,
      };
      
      // Add depth if specified
      if (config.depth !== undefined) {
        indexConfig.depth = config.depth;
      }
      
      // Use preset if specified
      if (config.preset && config.preset !== 'default') {
        indexConfig.preset = config.preset;
      }
      
      index = new Document(indexConfig);
      
      // Index existing documents
      try {
        const existingDocs = await col.getAll();
        for (const doc of existingDocs) {
          if (hasSearchableContent(doc, config.fields)) {
            index.add(doc);
          }
        }
        console.log(`FlexSearch indexed ${existingDocs.length} existing documents`);
      } catch (error) {
        console.warn('FlexSearch: Could not index existing documents during install:', error);
      }
      
      // Keep index in sync with changes
      const changeHandler = (e: Event) => {
        const changeEvent = e as ChangeEvent;
        const { op, id, doc } = changeEvent.detail;
        
        // Skip remote changes that might cause sync loops
        if (changeEvent.detail.source === 'broadcast') return;
        
        try {
          if (op === 'put' && doc && index) {
            // Remove existing document first (handles updates)
            index.remove(doc.id);
            
            // Add document if it has searchable content
            if (hasSearchableContent(doc, config.fields)) {
              index.add(doc);
            }
          } else if (op === 'delete' && id && index) {
            index.remove(id);
          } else if (op === 'clear' && index) {
            // Clear the entire index
            const allIds = index.search('*', { limit: 10000 });
            for (const result of allIds) {
              if (Array.isArray(result.result)) {
                for (const docId of result.result) {
                  index.remove(docId as string);
                }
              }
            }
          }
        } catch (error) {
          console.error('FlexSearch: Error updating index:', error);
        }
      };
      
      col.addEventListener('change', changeHandler);
    },
    
    async search(_next, query: string, opts?: SearchOptions): Promise<Doc[]> {
      if (!index || !collection) {
        throw new Error('FlexSearch not initialized');
      }
      
      if (!query || query.trim().length === 0) {
        return [];
      }
      
      try {
        // Perform search across all indexed fields
        const searchResults = index.search(query.trim(), {
          limit: opts?.limit ?? 100,
          suggest: true,
        });
        
        // FlexSearch returns array of { field, result: ids[] }
        // We need to flatten and dedupe the IDs
        const allIds = new Set<string>();
        
        for (const result of searchResults) {
          if (result.result && Array.isArray(result.result)) {
            for (const id of result.result) {
              allIds.add(id as string);
            }
          }
        }
        
        // If specific fields are requested, filter results
        if (opts?.fields && opts.fields.length > 0) {
          // Re-search with field restriction
          const fieldResults = new Set<string>();
          for (const field of opts.fields) {
            if (config.fields.includes(field)) {
              const fieldSearch = index.search(query.trim(), {
                index: field,
                limit: opts.limit ?? 100,
              });
              
              for (const result of fieldSearch) {
                if (result.result && Array.isArray(result.result)) {
                  for (const id of result.result) {
                    fieldResults.add(id as string);
                  }
                }
              }
            }
          }
          
          // Use field-filtered results
          allIds.clear();
          fieldResults.forEach(id => allIds.add(id));
        }
        
        // Fetch full documents for the found IDs
        const docs: Doc[] = [];
        for (const id of allIds) {
          try {
            const doc = await collection.get(id);
            if (doc) {
              docs.push(doc);
            }
          } catch (error) {
            console.warn(`FlexSearch: Could not fetch document ${id}:`, error);
          }
        }
        
        return docs;
        
      } catch (error) {
        console.error('FlexSearch: Search error:', error);
        throw new Error(`Search failed: ${(error as Error).message}`);
      }
    },
    
    async destroy() {
      // FlexSearch doesn't need explicit cleanup
      index = null;
      collection = null;
    }
  };
}

/**
 * Check if document has content in searchable fields
 */
function hasSearchableContent(doc: Doc, fields: string[]): boolean {
  for (const field of fields) {
    const value = doc[field];
    if (value !== null && value !== undefined && value !== '') {
      return true;
    }
  }
  return false;
}