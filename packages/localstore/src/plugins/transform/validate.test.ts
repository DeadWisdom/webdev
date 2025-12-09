/**
 * Tests for validation plugin
 */

import { test, expect, beforeEach } from "bun:test";
import { z } from 'zod';
import { localCollection } from '../../registry.ts';
import { memory } from '../storage/memory.ts';
import { validate, commonSchemas, schemaBuilders, validationMiddleware } from './validate.ts';
import type { Doc } from '../../types.ts';

// Test schemas
const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
  active: z.boolean().default(true)
});

const articleSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
  content: z.string().min(10),
  author: z.string().min(1),
  published: z.boolean().default(false),
  tags: z.array(z.string()).default([])
});

beforeEach(async () => {
  await localCollection.close();
});

test("validate plugin validates documents in strict mode", async () => {
  const collection = await localCollection('validate_test_strict',
    validate({ schema: userSchema, mode: 'strict' }),
    memory()
  );
  
  // Valid document should work
  await collection.put({
    id: 'user1',
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  });
  
  const user = await collection.get('user1');
  expect(user?.name).toBe('John Doe');
  expect(user?.active).toBe(true); // Default value applied
  
  // Invalid document should throw
  try {
    await collection.put({
      id: 'user2',
      name: '', // Invalid - empty name
      email: 'invalid-email', // Invalid email format
      age: -5 // Invalid age
    });
    expect(false).toBe(true); // Should not reach here
  } catch (error: any) {
    expect(error.name).toBe('ValidationError');
    expect(error.zodError).toBeDefined();
  }
  
  await collection.close();
});

test("validate plugin strips invalid fields in strip mode", async () => {
  const collection = await localCollection('validate_test_strip',
    validate({ schema: userSchema, mode: 'strip' }),
    memory()
  );
  
  // Document with invalid and extra fields
  await collection.put({
    id: 'user1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    age: 25,
    extraField: 'should be removed', // Extra field
    invalidAge: 'not a number' // This would conflict if included
  });
  
  const user = await collection.get('user1');
  expect(user?.name).toBe('Jane Doe');
  expect(user?.email).toBe('jane@example.com');
  expect(user?.age).toBe(25);
  expect((user as any)?.extraField).toBeUndefined();
  expect((user as any)?.invalidAge).toBeUndefined();
  expect(user?.active).toBe(true); // Default applied
  
  await collection.close();
});

test("validate plugin applies transforms in transform mode", async () => {
  const transformSchema = z.object({
    id: z.string(),
    name: z.string().transform(s => s.trim().toLowerCase()),
    email: z.string().email().transform(s => s.toLowerCase()),
    age: z.string().transform(s => parseInt(s, 10)), // Convert string to number
    active: z.boolean().default(true)
  });
  
  const collection = await localCollection('validate_test_transform',
    validate({ schema: transformSchema, mode: 'transform' }),
    memory()
  );
  
  await collection.put({
    id: 'user1',
    name: '  JOHN DOE  ',
    email: 'JOHN@EXAMPLE.COM',
    age: '30' // String that will be converted to number
  });
  
  const user = await collection.get('user1');
  expect(user?.name).toBe('john doe'); // Trimmed and lowercased
  expect(user?.email).toBe('john@example.com'); // Lowercased
  expect(user?.age).toBe(30); // Converted to number
  expect(user?.active).toBe(true); // Default applied
  
  await collection.close();
});

test("validate plugin handles error callbacks", async () => {
  let errorCalled = false;
  let errorDoc: Doc | undefined;
  let zodError: any;
  
  const collection = await localCollection('validate_test_error',
    validate({
      schema: userSchema,
      mode: 'strict',
      onError: async (error, doc) => {
        errorCalled = true;
        errorDoc = doc;
        zodError = error;
      }
    }),
    memory()
  );
  
  try {
    await collection.put({
      id: 'user1',
      name: '',
      email: 'invalid'
    });
  } catch (error) {
    // Expected to throw
  }
  
  expect(errorCalled).toBe(true);
  expect(errorDoc?.id).toBe('user1');
  expect(zodError).toBeDefined();
  
  await collection.close();
});

test("validate plugin skips validation when specified", async () => {
  const collection = await localCollection('validate_test_skip',
    validate({
      schema: userSchema,
      mode: 'strict',
      skipValidation: (doc) => doc.id === 'skip-me'
    }),
    memory()
  );
  
  // This should be validated and fail
  try {
    await collection.put({
      id: 'validate-me',
      name: '',
      email: 'invalid'
    });
    expect(false).toBe(true); // Should not reach here
  } catch (error: any) {
    expect(error.name).toBe('ValidationError');
  }
  
  // This should skip validation and succeed
  await collection.put({
    id: 'skip-me',
    name: '',
    email: 'invalid'
  });
  
  const skippedDoc = await collection.get('skip-me');
  expect(skippedDoc?.name).toBe('');
  expect(skippedDoc?.email).toBe('invalid');
  
  await collection.close();
});

test("validate plugin skips remote operations by default", async () => {
  const collection = await localCollection('validate_test_remote',
    validate({ schema: userSchema, mode: 'strict' }),
    memory()
  );
  
  // Remote operation should skip validation by default
  await collection.put({
    id: 'remote-user',
    name: '', // Invalid but should be accepted
    email: 'invalid'
  }, { remote: true });
  
  const remoteUser = await collection.get('remote-user');
  expect(remoteUser?.name).toBe('');
  expect(remoteUser?.email).toBe('invalid');
  
  // Local operation should still validate
  try {
    await collection.put({
      id: 'local-user',
      name: '',
      email: 'invalid'
    });
    expect(false).toBe(true); // Should not reach here
  } catch (error: any) {
    expect(error.name).toBe('ValidationError');
  }
  
  await collection.close();
});

test("common schemas work correctly", async () => {
  const collection = await localCollection('validate_test_common',
    validate({ schema: commonSchemas.user }),
    memory()
  );
  
  await collection.put({
    id: 'user1',
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  });
  
  const user = await collection.get('user1');
  expect(user?.name).toBe('John Doe');
  expect(user?.email).toBe('john@example.com');
  expect(user?.active).toBe(true); // Default
  expect(user?.roles).toEqual([]); // Default
  
  await collection.close();
});

test("schema builders work correctly", async () => {
  const customSchema = schemaBuilders.extendBasicDocument({
    title: z.string(),
    description: z.string().optional()
  });
  
  const collection = await localCollection('validate_test_builder',
    validate({ schema: customSchema }),
    memory()
  );
  
  await collection.put({
    id: 'doc1',
    title: 'Test Document',
    description: 'A test document'
  });
  
  const doc = await collection.get('doc1');
  expect(doc?.title).toBe('Test Document');
  expect(doc?.description).toBe('A test document');
  
  await collection.close();
});

test("partial schema builder works", async () => {
  const baseSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    required: z.string()
  });
  
  const partialSchema = schemaBuilders.createPartialSchema(baseSchema);
  
  const collection = await localCollection('validate_test_partial',
    validate({ schema: partialSchema }),
    memory()
  );
  
  // Should work with just id and one field (partial makes all fields optional except id)
  await collection.put({
    id: 'partial1',
    name: 'John Doe'
    // email and required fields are now optional
  });
  
  const doc = await collection.get('partial1');
  expect(doc?.name).toBe('John Doe');
  expect(doc?.id).toBe('partial1');
  
  // Should still require id
  try {
    await collection.put({
      name: 'Jane Doe'
      // missing id should fail
    });
    expect(false).toBe(true); // Should not reach here
  } catch (error: any) {
    expect(error.name).toBe('ValidationError');
  }
  
  await collection.close();
});

test("validation middleware factories work", async () => {
  // Test strict middleware
  const strictCollection = await localCollection('validate_middleware_strict',
    validationMiddleware.strict(userSchema),
    memory()
  );
  
  try {
    await strictCollection.put({
      id: 'user1',
      name: '',
      email: 'invalid'
    });
    expect(false).toBe(true);
  } catch (error: any) {
    expect(error.name).toBe('ValidationError');
  }
  
  await strictCollection.close();
  
  // Test permissive middleware
  const permissiveCollection = await localCollection('validate_middleware_permissive',
    validationMiddleware.permissive(userSchema),
    memory()
  );
  
  // Should strip invalid fields and allow document
  await permissiveCollection.put({
    id: 'user1',
    name: 'John Doe',
    email: 'john@example.com',
    invalidField: 'should be removed'
  });
  
  const user = await permissiveCollection.get('user1');
  expect(user?.name).toBe('John Doe');
  expect((user as any)?.invalidField).toBeUndefined();
  
  await permissiveCollection.close();
});

test("validation works with article schema", async () => {
  const collection = await localCollection('validate_test_article',
    validate({ schema: articleSchema }),
    memory()
  );
  
  await collection.put({
    id: 'article1',
    title: 'Test Article',
    content: 'This is a test article with enough content to pass validation.',
    author: 'John Doe'
  });
  
  const article = await collection.get('article1');
  expect(article?.title).toBe('Test Article');
  expect(article?.published).toBe(false); // Default
  expect(article?.tags).toEqual([]); // Default
  
  // Test validation failures
  try {
    await collection.put({
      id: 'article2',
      title: 'A'.repeat(150), // Too long
      content: 'Short', // Too short
      author: ''
    });
    expect(false).toBe(true);
  } catch (error: any) {
    expect(error.name).toBe('ValidationError');
    expect(error.message).toContain('Validation failed');
  }
  
  await collection.close();
});

test("validation error includes helpful information", async () => {
  const collection = await localCollection('validate_test_error_info',
    validate({ schema: userSchema, mode: 'strict' }),
    memory()
  );
  
  try {
    await collection.put({
      id: 'user1',
      name: '', // Invalid - too short
      email: 'not-an-email', // Invalid - not email format
      age: 200 // Invalid - too old
    });
    expect(false).toBe(true);
  } catch (error: any) {
    expect(error.name).toBe('ValidationError');
    expect(error.zodError).toBeDefined();
    expect(error.document).toBeDefined();
    expect(error.message).toContain('Validation failed');
    expect(error.message).toContain('name');
    expect(error.message).toContain('email');
    expect(error.message).toContain('age');
  }
  
  await collection.close();
});

// Clean up
test("cleanup validation tests", async () => {
  await localCollection.close();
});