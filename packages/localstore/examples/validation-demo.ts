/**
 * Validation Demo - Zod-based document validation capabilities
 */

import { z } from 'zod';
import { localCollection, memory, timestamps } from '../src/index.ts';
import { validate, commonSchemas, schemaBuilders, validationMiddleware } from '../src/plugins/transform/validate.ts';

async function validationDemo() {
  console.log('✅ LocalStore Validation Demo\n');
  console.log('🔍 Demonstrating Zod-based document validation...\n');
  
  // ===============================================
  // 1. Basic Validation Setup
  // ===============================================
  console.log('1️⃣  Setting up basic validation...');
  
  // Define a user schema
  const userSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Must be a valid email"),
    age: z.number().int().min(0).max(150).optional(),
    role: z.enum(['user', 'admin', 'moderator']).default('user'),
    active: z.boolean().default(true),
    preferences: z.object({
      theme: z.enum(['light', 'dark']).default('light'),
      notifications: z.boolean().default(true)
    }).default({ theme: 'light', notifications: true })
  });
  
  const users = await localCollection('users',
    timestamps(),
    validate({ schema: userSchema, mode: 'strict' }),
    memory()
  );
  
  console.log('   ✅ Collection created with strict validation');
  
  // Valid user
  await users.put({
    id: 'user1',
    name: 'John Doe',
    email: 'john@example.com',
    age: 30,
    role: 'admin'
  });
  
  console.log('   ✅ Valid user created successfully');
  
  const user = await users.get('user1');
  console.log(`   👤 User: ${user?.name} (${user?.email}) - Role: ${user?.role}`);
  console.log(`   🎨 Theme: ${user?.preferences?.theme}, Notifications: ${user?.preferences?.notifications}`);
  console.log();
  
  // ===============================================
  // 2. Validation Errors
  // ===============================================
  console.log('2️⃣  Demonstrating validation errors...');
  
  const validationErrors: any[] = [];
  
  // Try invalid users
  const invalidUsers = [
    { id: '', name: 'Invalid User', email: 'test@example.com' }, // Empty ID
    { id: 'user2', name: '', email: 'test@example.com' }, // Empty name
    { id: 'user3', name: 'Test User', email: 'not-an-email' }, // Invalid email
    { id: 'user4', name: 'Test User', email: 'test@example.com', age: -5 }, // Invalid age
    { id: 'user5', name: 'Test User', email: 'test@example.com', role: 'invalid' }, // Invalid role
  ];
  
  for (const [index, invalidUser] of invalidUsers.entries()) {
    try {
      await users.put(invalidUser);
      console.log(`   ❌ Expected validation error for invalid user ${index + 1}`);
    } catch (error: any) {
      if (error.name === 'ValidationError') {
        validationErrors.push({
          user: index + 1,
          message: error.message,
          fields: error.zodError?.errors?.map((e: any) => e.path?.join('.') || 'root') || ['unknown']
        });
        console.log(`   🚫 Invalid user ${index + 1}: ${error.zodError?.errors?.[0]?.message || 'Validation failed'}`);
      }
    }
  }
  
  console.log(`   📊 Caught ${validationErrors.length} validation errors as expected`);
  console.log();
  
  // ===============================================
  // 3. Strip Mode Validation
  // ===============================================
  console.log('3️⃣  Demonstrating strip mode validation...');
  
  const permissiveUsers = await localCollection('permissive-users',
    timestamps(),
    validate({ schema: userSchema, mode: 'strip' }),
    memory()
  );
  
  // Add user with extra and invalid fields
  await permissiveUsers.put({
    id: 'permissive1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    age: 25,
    extraField: 'This will be stripped',
    anotherExtra: { nested: 'data' },
    invalidAge: 'not a number' // This would cause errors in strict mode
  });
  
  const permissiveUser = await permissiveUsers.get('permissive1');
  console.log(`   👤 Permissive user: ${permissiveUser?.name} (${permissiveUser?.email})`);
  console.log(`   🧹 Extra fields stripped: ${!(permissiveUser as any).extraField ? 'Yes' : 'No'}`);
  console.log(`   ✅ Valid fields preserved: age=${permissiveUser?.age}, role=${permissiveUser?.role}`);
  console.log();
  
  // ===============================================
  // 4. Transform Mode Validation
  // ===============================================
  console.log('4️⃣  Demonstrating transform mode validation...');
  
  const transformSchema = z.object({
    id: z.string(),
    name: z.string().transform(s => s.trim().toLowerCase()),
    email: z.string().transform(s => s.toLowerCase().trim()).pipe(z.string().email()),
    age: z.union([z.number(), z.string()]).transform(val => 
      typeof val === 'string' ? parseInt(val, 10) : val
    ),
    tags: z.string().transform(s => s.split(',').map(tag => tag.trim())),
    active: z.union([z.boolean(), z.string()]).transform(val => 
      typeof val === 'string' ? val.toLowerCase() === 'true' : val
    )
  });
  
  const transformUsers = await localCollection('transform-users',
    validate({ schema: transformSchema, mode: 'transform' }),
    memory()
  );
  
  await transformUsers.put({
    id: 'transform1',
    name: '  JANE DOE  ',
    email: 'JANE@EXAMPLE.COM  ',
    age: '30', // String that will be converted to number
    tags: 'developer, javascript, typescript', // String that will be split into array
    active: 'true' // String that will be converted to boolean
  });
  
  const transformUser = await transformUsers.get('transform1');
  console.log(`   👤 Transformed user: ${transformUser?.name} (${transformUser?.email})`);
  console.log(`   🔢 Age: ${transformUser?.age} (type: ${typeof transformUser?.age})`);
  console.log(`   🏷️  Tags: ${JSON.stringify(transformUser?.tags)}`);
  console.log(`   ✅ Active: ${transformUser?.active} (type: ${typeof transformUser?.active})`);
  console.log();
  
  // ===============================================
  // 5. Common Schemas
  // ===============================================
  console.log('5️⃣  Demonstrating common schemas...');
  
  // Article collection with common schema
  const articles = await localCollection('articles',
    timestamps(),
    validate({ schema: commonSchemas.article }),
    memory()
  );
  
  await articles.put({
    id: 'article1',
    title: 'Introduction to LocalStore',
    content: 'LocalStore is a powerful plugin-based browser data layer that provides seamless data management with validation, sync, and search capabilities.',
    author: 'John Doe'
  });
  
  const article = await articles.get('article1');
  console.log(`   📄 Article: "${article?.title}" by ${article?.author}`);
  console.log(`   📝 Content length: ${article?.content?.length} characters`);
  console.log(`   📅 Published: ${article?.published ? 'Yes' : 'No'}`);
  console.log(`   🏷️  Tags: ${article?.tags?.length || 0} tags`);
  
  // Todo collection with common schema
  const todos = await localCollection('todos',
    timestamps(),
    validate({ schema: commonSchemas.todo }),
    memory()
  );
  
  await todos.put({
    id: 'todo1',
    title: 'Implement validation plugin',
    description: 'Add Zod-based validation to LocalStore',
    priority: 'high'
  });
  
  const todo = await todos.get('todo1');
  console.log(`   ☐ Todo: "${todo?.title}" (Priority: ${todo?.priority})`);
  console.log(`   ✅ Completed: ${todo?.completed ? 'Yes' : 'No'}`);
  console.log();
  
  // ===============================================
  // 6. Schema Builders
  // ===============================================
  console.log('6️⃣  Demonstrating schema builders...');
  
  // Extend basic document
  const postSchema = schemaBuilders.extendBasicDocument({
    title: z.string().min(1),
    content: z.string().min(10),
    author: z.string(),
    published: z.boolean().default(false),
    viewCount: z.number().default(0)
  });
  
  const posts = await localCollection('posts',
    timestamps(),
    validate({ schema: postSchema }),
    memory()
  );
  
  await posts.put({
    id: 'post1',
    title: 'Schema Builder Example',
    content: 'This post was created using a schema built from the basic document schema.',
    author: 'Schema Builder'
  });
  
  const post = await posts.get('post1');
  console.log(`   📝 Post: "${post?.title}" by ${post?.author}`);
  console.log(`   👁️  Views: ${post?.viewCount}, Published: ${post?.published}`);
  console.log(`   📅 Created: ${new Date(post?.createdAt as number).toLocaleString()}`);
  
  // Partial schema for updates
  const partialSchema = schemaBuilders.createPartialSchema(postSchema);
  const partialPosts = await localCollection('partial-posts',
    validate({ schema: partialSchema }),
    memory()
  );
  
  // Can update with just a few fields
  await partialPosts.put({
    id: 'partial1',
    title: 'Partial Update Example'
  });
  
  const partialPost = await partialPosts.get('partial1');
  console.log(`   📝 Partial post: "${partialPost?.title}"`);
  console.log();
  
  // ===============================================
  // 7. Validation Middleware
  // ===============================================
  console.log('7️⃣  Demonstrating validation middleware...');
  
  // Strict middleware
  const strictProducts = await localCollection('strict-products',
    validationMiddleware.strict(commonSchemas.product),
    memory()
  );
  
  await strictProducts.put({
    id: 'product1',
    name: 'Laptop',
    price: 999.99,
    category: 'Electronics'
  });
  
  console.log(`   💻 Strict product created successfully`);
  
  // Permissive middleware
  const permissiveProducts = await localCollection('permissive-products',
    validationMiddleware.permissive(commonSchemas.product),
    memory()
  );
  
  await permissiveProducts.put({
    id: 'product2',
    name: 'Phone',
    price: 699.99,
    category: 'Electronics',
    extraInfo: 'This extra field will be stripped',
    metadata: { 
      nested: 'data',
      willBe: 'removed'
    }
  });
  
  const permissiveProduct = await permissiveProducts.get('product2');
  console.log(`   📱 Permissive product: ${permissiveProduct?.name} ($${permissiveProduct?.price})`);
  console.log(`   🧹 Extra fields removed: ${!(permissiveProduct as any).extraInfo ? 'Yes' : 'No'}`);
  
  // Skip validation for specific conditions
  const conditionalUsers = await localCollection('conditional-users',
    validationMiddleware.skipFor(userSchema, (doc) => doc.id.startsWith('import-')),
    memory()
  );
  
  // This will be validated
  await conditionalUsers.put({
    id: 'regular-user',
    name: 'Regular User',
    email: 'regular@example.com'
  });
  
  // This will skip validation
  await conditionalUsers.put({
    id: 'import-user',
    name: '', // Invalid but will be skipped
    email: 'invalid-email'
  });
  
  const regularUser = await conditionalUsers.get('regular-user');
  const importUser = await conditionalUsers.get('import-user');
  
  console.log(`   👤 Regular user: ${regularUser?.name} (validated)`);
  console.log(`   📥 Import user: ${importUser?.name || '[empty]'} (skipped validation)`);
  console.log();
  
  // ===============================================
  // 8. Error Handling and Logging
  // ===============================================
  console.log('8️⃣  Demonstrating error handling...');
  
  const errorEvents: any[] = [];
  
  const loggedUsers = await localCollection('logged-users',
    validationMiddleware.withLogging(userSchema, 'strict'),
    memory()
  );
  
  // Capture console.warn calls
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    errorEvents.push(args);
  };
  
  try {
    await loggedUsers.put({
      id: 'invalid-user',
      name: '',
      email: 'not-an-email'
    });
  } catch (error) {
    // Expected error
  }
  
  // Restore console.warn
  console.warn = originalWarn;
  
  console.log(`   📝 Error logged: ${errorEvents.length > 0 ? 'Yes' : 'No'}`);
  if (errorEvents.length > 0) {
    console.log(`   🐛 Error details captured for debugging`);
  }
  console.log();
  
  // ===============================================
  // 9. Performance and Statistics
  // ===============================================
  console.log('9️⃣  Performance metrics...');
  
  const startTime = Date.now();
  
  // Create many validated documents
  const performanceUsers = await localCollection('performance-users',
    validate({ schema: userSchema }),
    memory()
  );
  
  console.log('   ⚡ Creating 100 validated users...');
  for (let i = 1; i <= 100; i++) {
    await performanceUsers.put({
      id: `perf-user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
      role: i % 3 === 0 ? 'admin' : i % 5 === 0 ? 'moderator' : 'user'
    });
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`   📈 Created 100 users in ${duration}ms`);
  console.log(`   ⚡ Average: ${(duration / 100).toFixed(1)}ms per user`);
  
  const allUsers = await performanceUsers.getAll();
  const roleStats = allUsers.reduce((stats: any, user) => {
    stats[user.role] = (stats[user.role] || 0) + 1;
    return stats;
  }, {});
  
  console.log('   📊 User role distribution:', roleStats);
  console.log();
  
  // ===============================================
  // 10. Cleanup
  // ===============================================
  console.log('🧹 Cleanup...');
  
  await Promise.all([
    users.close(),
    permissiveUsers.close(),
    transformUsers.close(),
    articles.close(),
    todos.close(),
    posts.close(),
    partialPosts.close(),
    strictProducts.close(),
    permissiveProducts.close(),
    conditionalUsers.close(),
    loggedUsers.close(),
    performanceUsers.close()
  ]);
  
  console.log('   ✅ All collections closed');
  
  await localCollection.close();
  console.log('   ✅ LocalStore closed');
  
  console.log('\n✅ Validation Demo Complete!');
  console.log('=' .repeat(50));
  console.log('✨ Features Demonstrated:');
  console.log();
  console.log('🔍 VALIDATION MODES:');
  console.log('   • Strict validation (fail on invalid data)');
  console.log('   • Strip mode (remove invalid fields)');
  console.log('   • Transform mode (apply schema transforms)');
  console.log('   • Conditional validation skipping');
  console.log();
  console.log('📚 SCHEMA FEATURES:');
  console.log('   • Pre-built common schemas');
  console.log('   • Schema builders and extensions');
  console.log('   • Partial schemas for updates');
  console.log('   • Custom transformations and defaults');
  console.log();
  console.log('🛠️ DEVELOPER EXPERIENCE:');
  console.log('   • Detailed error messages');
  console.log('   • Error logging and callbacks');
  console.log('   • Middleware factories');
  console.log('   • TypeScript type safety');
  console.log();
  console.log('⚡ PRODUCTION READY:');
  console.log('   • High-performance validation');
  console.log('   • Remote operation handling');
  console.log('   • Flexible error handling');
  console.log('   • Comprehensive test coverage');
  console.log();
  console.log('Ready for production data validation! 🚀');
}

// Run the demo
validationDemo().catch(console.error);