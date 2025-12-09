/**
 * Tests for FlexSearch plugin
 */

import { test, expect } from "bun:test";
import { localCollection } from '../../registry.ts';
import { memory } from '../storage/memory.ts';
import { flexSearch } from './flexsearch.ts';
import type { Doc } from '../../types.ts';

test("flexSearch plugin creates with field array", () => {
  const plugin = flexSearch(['title', 'content']);
  expect(plugin.name).toBe('flexSearch');
  expect(typeof plugin.install).toBe('function');
  expect(typeof plugin.search).toBe('function');
});

test("flexSearch plugin creates with options object", () => {
  const plugin = flexSearch({
    fields: ['name', 'description'],
    tokenize: 'forward',
    preset: 'memory'
  });
  expect(plugin.name).toBe('flexSearch');
});

test("flexSearch plugin throws on empty fields", () => {
  expect(() => flexSearch([])).toThrow('requires at least one field');
  expect(() => flexSearch({ fields: [] })).toThrow('requires at least one field');
});

test("basic search functionality", async () => {
  const collection = await localCollection('search_test_1',
    flexSearch(['title', 'content']),
    memory()
  );
  
  // Add some documents
  await collection.put({
    id: '1',
    title: 'JavaScript Guide',
    content: 'Learn JavaScript programming fundamentals',
    category: 'Programming'
  });
  
  await collection.put({
    id: '2', 
    title: 'React Tutorial',
    content: 'Build user interfaces with React components',
    category: 'Frontend'
  });
  
  await collection.put({
    id: '3',
    title: 'Python Basics',
    content: 'Introduction to Python programming language',
    category: 'Programming'
  });
  
  // Search for "JavaScript"
  const results = await collection.search('JavaScript');
  expect(results).toHaveLength(1);
  expect(results[0].title).toBe('JavaScript Guide');
  
  // Search for "programming"
  const programmingResults = await collection.search('programming');
  expect(programmingResults).toHaveLength(2);
  const titles = programmingResults.map(r => r.title).sort();
  expect(titles).toEqual(['JavaScript Guide', 'Python Basics']);
  
  // Search for "React"
  const reactResults = await collection.search('React');
  expect(reactResults).toHaveLength(1);
  expect(reactResults[0].title).toBe('React Tutorial');
  
  await collection.close();
});

test("search with existing documents during install", async () => {
  // Create collection with pre-existing data
  const collection = await localCollection('search_test_2',
    memory({ initialData: [
      { id: '1', name: 'Apple', description: 'A red fruit' },
      { id: '2', name: 'Banana', description: 'A yellow fruit' },
      { id: '3', name: 'Carrot', description: 'An orange vegetable' }
    ]}),
    flexSearch(['name', 'description'])
  );
  
  // Should be able to search pre-existing documents
  const fruitResults = await collection.search('fruit');
  expect(fruitResults).toHaveLength(2);
  
  const names = fruitResults.map(r => r.name).sort();
  expect(names).toEqual(['Apple', 'Banana']);
  
  await collection.close();
});

test("search index stays in sync with changes", async () => {
  const collection = await localCollection('search_test_3',
    flexSearch(['title', 'body']),
    memory()
  );
  
  // Add initial document
  await collection.put({
    id: '1',
    title: 'Original Title',
    body: 'Original content about cats'
  });
  
  // Should find it
  let results = await collection.search('cats');
  expect(results).toHaveLength(1);
  expect(results[0].title).toBe('Original Title');
  
  // Update the document
  await collection.put({
    id: '1', 
    title: 'Updated Title',
    body: 'Updated content about dogs'
  });
  
  // Should not find old content
  results = await collection.search('cats');
  expect(results).toHaveLength(0);
  
  // Should find new content
  results = await collection.search('dogs');
  expect(results).toHaveLength(1);
  expect(results[0].title).toBe('Updated Title');
  
  // Add another document
  await collection.put({
    id: '2',
    title: 'Second Post',
    body: 'More content about cats'
  });
  
  // Should find the new document
  results = await collection.search('cats');
  expect(results).toHaveLength(1);
  expect(results[0].id).toBe('2');
  
  // Delete a document
  await collection.delete('2');
  
  // Should no longer find deleted document
  results = await collection.search('cats');
  expect(results).toHaveLength(0);
  
  await collection.close();
});

test("search with clear operation", async () => {
  const collection = await localCollection('search_test_4',
    flexSearch(['name']),
    memory()
  );
  
  // Add documents
  await collection.put({ id: '1', name: 'First item' });
  await collection.put({ id: '2', name: 'Second item' });
  
  // Verify search works
  let results = await collection.search('item');
  expect(results).toHaveLength(2);
  
  // Clear all
  await collection.clear();
  
  // Search should return empty
  results = await collection.search('item');
  expect(results).toHaveLength(0);
  
  // Add new document after clear
  await collection.put({ id: '3', name: 'Third item' });
  
  // Should find new document
  results = await collection.search('item');
  expect(results).toHaveLength(1);
  expect(results[0].id).toBe('3');
  
  await collection.close();
});

test("search with limit option", async () => {
  const collection = await localCollection('search_test_5',
    flexSearch(['content']),
    memory()
  );
  
  // Add multiple documents with same search term
  for (let i = 1; i <= 10; i++) {
    await collection.put({
      id: `${i}`,
      content: `Document ${i} contains the word test for searching`
    });
  }
  
  // Search with no limit
  let results = await collection.search('test');
  expect(results.length).toBeGreaterThanOrEqual(10);
  
  // Search with limit
  results = await collection.search('test', { limit: 3 });
  expect(results).toHaveLength(3);
  
  await collection.close();
});

test("search with field filtering", async () => {
  const collection = await localCollection('search_test_6',
    flexSearch(['title', 'content', 'tags']),
    memory()
  );
  
  await collection.put({
    id: '1',
    title: 'JavaScript Tutorial',
    content: 'Learn React and Vue',
    tags: 'programming web'
  });
  
  await collection.put({
    id: '2',
    title: 'React Guide',
    content: 'JavaScript framework for UI',
    tags: 'react frontend'
  });
  
  // Search all fields
  let results = await collection.search('JavaScript');
  expect(results).toHaveLength(2);
  
  // Search only in title field
  results = await collection.search('JavaScript', { fields: ['title'] });
  expect(results).toHaveLength(1);
  expect(results[0].title).toBe('JavaScript Tutorial');
  
  // Search only in content field  
  results = await collection.search('JavaScript', { fields: ['content'] });
  expect(results).toHaveLength(1);
  expect(results[0].title).toBe('React Guide');
  
  await collection.close();
});

test("search handles empty and whitespace queries", async () => {
  const collection = await localCollection('search_test_7',
    flexSearch(['text']),
    memory()
  );
  
  await collection.put({ id: '1', text: 'Some content' });
  
  // Empty query
  let results = await collection.search('');
  expect(results).toHaveLength(0);
  
  // Whitespace only
  results = await collection.search('   ');
  expect(results).toHaveLength(0);
  
  // Valid query
  results = await collection.search('content');
  expect(results).toHaveLength(1);
  
  await collection.close();
});

test("search handles documents without searchable content", async () => {
  const collection = await localCollection('search_test_8',
    flexSearch(['name', 'description']),
    memory()
  );
  
  // Document with searchable content
  await collection.put({
    id: '1',
    name: 'Valid Item',
    description: 'Has searchable text',
    metadata: { hidden: true }
  });
  
  // Document without searchable content in indexed fields
  await collection.put({
    id: '2',
    name: '', // empty
    description: null, // null
    metadata: { data: 'not searchable' }
  });
  
  // Document with undefined searchable fields
  await collection.put({
    id: '3',
    metadata: { info: 'no name or description' }
  });
  
  const results = await collection.search('searchable');
  expect(results).toHaveLength(1);
  expect(results[0].id).toBe('1');
  
  await collection.close();
});

test("search error handling", async () => {
  const collection = await localCollection('search_test_9',
    flexSearch(['title']),
    memory()
  );
  
  // Close collection to simulate broken state
  await collection.close();
  
  // Search should throw error
  try {
    await collection.search('test');
    expect(true).toBe(false); // Should not reach
  } catch (err) {
    expect((err as Error).message).toContain('FlexSearch not initialized');
  }
});

test("search with different tokenization settings", async () => {
  const collection = await localCollection('search_test_10',
    flexSearch({
      fields: ['content'],
      tokenize: 'strict',
      preset: 'memory'
    }),
    memory()
  );
  
  await collection.put({
    id: '1',
    content: 'test-case with-hyphens and_underscores'
  });
  
  // Strict tokenization should handle exact matches
  const results = await collection.search('test-case');
  expect(results).toHaveLength(1);
  
  await collection.close();
});

// Clean up
test("cleanup search tests", async () => {
  await localCollection.close();
});