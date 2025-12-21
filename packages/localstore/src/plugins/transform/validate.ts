/**
 * Validation plugin - Zod-based document validation
 */

import { z, type ZodSchema, type ZodError } from 'zod';
import type { Plugin, Doc, WriteOptions } from '../../types.ts';

export interface ValidationOptions {
  schema: ZodSchema;
  mode?: 'strict' | 'strip' | 'transform'; // strict = error on invalid, strip = remove invalid fields, transform = apply schema transform
  onError?: (error: ZodError, doc: Doc) => void | Promise<void>;
  skipValidation?: (doc: Doc, opts?: WriteOptions) => boolean; // Function to skip validation for certain docs
}

export interface ValidationError extends Error {
  name: 'ValidationError';
  zodError: ZodError;
  document: Doc;
}

export function validate(options: ValidationOptions): Plugin {
  const config = {
    mode: options.mode || 'strict',
    schema: options.schema,
    onError: options.onError,
    skipValidation: options.skipValidation
  };

  return {
    name: 'validate',
    
    async put(next, doc: Doc, opts?: WriteOptions): Promise<void> {
      // Skip validation if specified
      if (config.skipValidation && config.skipValidation(doc, opts)) {
        return next(doc, opts);
      }
      
      // Skip validation for remote operations unless explicitly enabled
      if (opts?.remote && !opts.validateRemote) {
        return next(doc, opts);
      }
      
      try {
        let validatedDoc: Doc;
        
        switch (config.mode) {
          case 'strict':
            // Parse with strict validation - will throw on invalid data
            validatedDoc = config.schema.parse(doc) as Doc;
            break;
            
          case 'strip':
            // Strip unknown fields but keep valid ones
            const stripResult = config.schema.safeParse(doc);
            if (stripResult.success) {
              validatedDoc = stripResult.data as Doc;
            } else {
              // Try to create a valid document by omitting invalid fields
              validatedDoc = await stripInvalidFields(doc, config.schema);
            }
            break;

          case 'transform':
            // Apply schema transforms and coercions
            validatedDoc = config.schema.parse(doc) as Doc;
            break;

          default:
            validatedDoc = config.schema.parse(doc) as Doc;
        }
        
        // Continue with validated/transformed document
        return next(validatedDoc, opts);
        
      } catch (error) {
        if (error instanceof z.ZodError) {
          const validationError: ValidationError = new Error(
            `Validation failed: ${formatZodError(error)}`
          ) as ValidationError;
          validationError.name = 'ValidationError';
          validationError.zodError = error;
          validationError.document = doc;
          
          // Call error handler if provided
          if (config.onError) {
            try {
              await config.onError(error, doc);
            } catch (onErrorException) {
              console.warn('Error in onError handler:', onErrorException);
            }
          }
          
          throw validationError;
        }
        
        // Re-throw non-validation errors
        throw error;
      }
    }
  };
}

// Helper function to strip invalid fields and create a valid document
async function stripInvalidFields(doc: Doc, schema: ZodSchema): Promise<Doc> {
  // For object schemas, try to validate field by field
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const validDoc: Record<string, any> = {};
    
    // Always preserve the id field
    if (doc.id) {
      validDoc.id = doc.id;
    }
    
    // Validate each field individually
    for (const [key, fieldSchema] of Object.entries(shape)) {
      if (key in doc) {
        try {
          validDoc[key] = (fieldSchema as ZodSchema).parse(doc[key]);
        } catch {
          // Skip invalid fields in strip mode
          continue;
        }
      }
    }
    
    return validDoc as Doc;
  }
  
  // For non-object schemas, fall back to the original document
  // This is a simplified approach - in practice you might want more sophisticated stripping
  return doc;
}

// Helper function to format Zod errors into readable messages
function formatZodError(error: ZodError): string {
  const issues = (error as any).issues || (error as any).errors;
  if (!issues || !Array.isArray(issues)) {
    return error.message || 'Validation error';
  }

  return issues
    .map((err: any) => {
      const path = err.path && err.path.length > 0 ? `${err.path.join('.')}: ` : '';
      return `${path}${err.message}`;
    })
    .join(', ');
}

// Pre-built common schemas for convenience
export const commonSchemas = {
  // Basic document with id and timestamps
  basicDocument: z.object({
    id: z.string().min(1),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional()
  }),
  
  // User document
  user: z.object({
    id: z.string(),
    name: z.string().min(1),
    email: z.string().email(),
    age: z.number().int().min(0).max(150).optional(),
    active: z.boolean().default(true),
    roles: z.array(z.string()).default([]),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional()
  }),
  
  // Article/Post document
  article: z.object({
    id: z.string(),
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    author: z.string().min(1),
    tags: z.array(z.string()).default([]),
    published: z.boolean().default(false),
    publishedAt: z.number().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional()
  }),
  
  // Todo item
  todo: z.object({
    id: z.string(),
    title: z.string().min(1),
    description: z.string().optional(),
    completed: z.boolean().default(false),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    dueDate: z.number().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional()
  }),
  
  // Product document
  product: z.object({
    id: z.string(),
    name: z.string().min(1),
    description: z.string().optional(),
    price: z.number().min(0),
    currency: z.string().length(3).default('USD'),
    category: z.string().min(1),
    inStock: z.boolean().default(true),
    inventory: z.number().int().min(0).default(0),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional()
  })
};

// Schema builders for common patterns
export const schemaBuilders = {
  // Create a schema that extends basicDocument
  extendBasicDocument: (fields: z.ZodRawShape) => {
    return commonSchemas.basicDocument.extend(fields);
  },
  
  // Create a schema with optional fields
  withOptionalFields: (baseSchema: ZodSchema, optionalFields: string[]) => {
    if (baseSchema instanceof z.ZodObject) {
      const shape = { ...baseSchema.shape };
      for (const field of optionalFields) {
        if (shape[field]) {
          shape[field] = shape[field].optional();
        }
      }
      return z.object(shape);
    }
    return baseSchema;
  },
  
  // Create a schema that allows partial updates (all fields optional except id)
  createPartialSchema: (baseSchema: ZodSchema) => {
    if (baseSchema instanceof z.ZodObject) {
      // Make all fields optional first, then override id to be required
      const partialSchema = baseSchema.partial();
      const shape = { ...(partialSchema as any).shape };
      if (shape.id) {
        shape.id = z.string().min(1); // Keep id required
      }
      return z.object(shape);
    }
    return baseSchema;
  },
  
  // Create a schema with additional validation
  withCustomValidation: (baseSchema: ZodSchema, validator: (data: any) => boolean, message: string) => {
    return baseSchema.refine(validator, { message });
  }
};

// Validation middleware factory for common use cases
export const validationMiddleware = {
  // Strict validation - documents must match schema exactly
  strict: (schema: ZodSchema) => validate({ schema, mode: 'strict' }),
  
  // Permissive validation - strip invalid fields but allow document
  permissive: (schema: ZodSchema) => validate({ schema, mode: 'strip' }),
  
  // Transform validation - apply schema transformations
  transform: (schema: ZodSchema) => validate({ schema, mode: 'transform' }),
  
  // Validation with error logging
  withLogging: (schema: ZodSchema, mode: ValidationOptions['mode'] = 'strict') => 
    validate({
      schema,
      mode,
      onError: async (error, doc) => {
        console.warn('Validation error:', {
          document: doc,
          errors: (error as any).issues || (error as any).errors,
          timestamp: new Date().toISOString()
        });
      }
    }),
  
  // Skip validation for specific document types
  skipFor: (schema: ZodSchema, skipCondition: (doc: Doc) => boolean) =>
    validate({
      schema,
      skipValidation: skipCondition
    }),
  
  // Validate only new documents (not updates)
  newDocumentsOnly: (schema: ZodSchema) =>
    validate({
      schema,
      skipValidation: (doc) => Boolean(doc.updatedAt) // Skip if document has been updated before
    }),
  
  // Development mode - log errors but don't throw
  development: (schema: ZodSchema) =>
    validate({
      schema,
      mode: 'strip',
      onError: async (error, doc) => {
        console.warn('Validation failed in development mode:', {
          document: doc,
          errors: (error as any).issues || (error as any).errors
        });
      }
    })
};