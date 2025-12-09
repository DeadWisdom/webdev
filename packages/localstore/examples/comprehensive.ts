/**
 * Comprehensive example showcasing all LocalStore features
 */

import { localCollection, memory, indexedDB, timestamps, broadcast } from '../src/index.ts';

async function comprehensiveDemo() {
  console.log('🚀 LocalStore Comprehensive Demo\n');
  
  // Demo 1: Memory Storage with Timestamps
  console.log('📝 Demo 1: Memory Storage + Timestamps');
  console.log('=====================================');
  
  const sessionData = await localCollection('session',
    timestamps(),
    memory()
  );
  
  await sessionData.put({
    id: 'user-1',
    name: 'Alice',
    status: 'online'
  });
  
  const user = await sessionData.get('user-1');
  console.log('User data:', user);
  console.log('Created at:', new Date(user!.createdAt as number).toLocaleString());
  console.log();
  
  // Demo 2: Multiple Plugin Chains
  console.log('🔗 Demo 2: Plugin Chain Composition');
  console.log('===================================');
  
  // Create a collection with all our plugins
  const products = await localCollection('products',
    timestamps({ created: 'created', updated: 'modified' }), // Custom field names
    broadcast({ channel: 'product-updates' }), // Custom channel
    indexedDB({ database: 'demo-store' }) // Custom database
  );
  
  // Subscribe to changes
  let changeCount = 0;
  const unsubscribe = products.subscribe((docs) => {
    changeCount++;
    console.log(`📡 Subscription update #${changeCount}: ${docs.length} products`);
  });
  
  // Add some products
  await products.put({
    id: 'widget-1',
    name: 'Super Widget',
    price: 29.99,
    category: 'Electronics'
  });
  
  await products.put({
    id: 'gadget-1', 
    name: 'Amazing Gadget',
    price: 49.99,
    category: 'Electronics'
  });
  
  await products.put({
    id: 'tool-1',
    name: 'Handy Tool',
    price: 15.99,
    category: 'Tools'
  });
  
  console.log('Added 3 products');
  console.log();
  
  // Demo 3: Event Handling
  console.log('📻 Demo 3: Event System');
  console.log('======================');
  
  const events: any[] = [];
  
  // Collection-level events
  products.addEventListener('change', (e) => {
    const detail = (e as CustomEvent).detail;
    events.push(`Collection: ${detail.op} ${detail.id}`);
  });
  
  // Global events
  localCollection.addEventListener('change', (e) => {
    const detail = (e as CustomEvent).detail;
    events.push(`Global: ${detail.collection}/${detail.op}`);
  });
  
  // Make a change
  await products.put({
    id: 'widget-1',
    name: 'Super Widget Pro',
    price: 39.99,
    category: 'Electronics'
  });
  
  await products.delete('tool-1');
  
  console.log('Events captured:');
  events.forEach(event => console.log(`  - ${event}`));
  console.log();
  
  // Demo 4: Data Querying
  console.log('🔍 Demo 4: Data Operations');
  console.log('==========================');
  
  const allProducts = await products.getAll();
  console.log(`Total products: ${allProducts.length}`);
  
  for (const product of allProducts) {
    const created = new Date(product.created as number).toLocaleDateString();
    const modified = new Date(product.modified as number).toLocaleString();
    console.log(`  • ${product.name} - $${product.price} (created: ${created}, modified: ${modified})`);
  }
  console.log();
  
  // Demo 5: Plugin-specific Features
  console.log('🔧 Demo 5: Plugin Features');
  console.log('==========================');
  
  // Create collection with memory for quick demo
  const features = await localCollection('features-demo',
    timestamps(),
    memory({ initialData: [
      { id: '1', feature: 'Plugin Architecture', status: 'implemented' },
      { id: '2', feature: 'Event System', status: 'implemented' },
      { id: '3', feature: 'Cross-tab Sync', status: 'implemented' }
    ]})
  );
  
  console.log('Memory plugin initialized with data:');
  const initialFeatures = await features.getAll();
  initialFeatures.forEach(f => console.log(`  ✅ ${f.feature}: ${f.status}`));
  console.log();
  
  // Demo 6: Error Handling
  console.log('⚠️  Demo 6: Error Handling');
  console.log('=========================');
  
  try {
    // Try to use search (not implemented)
    await products.search('widget');
  } catch (error) {
    console.log('Expected error for unimplemented method:');
    console.log(`  ❌ ${(error as Error).message}`);
  }
  
  try {
    // Try to create duplicate collection
    await localCollection('products', memory());
  } catch (error) {
    console.log('Expected error for duplicate collection:');
    console.log(`  ❌ ${(error as Error).message}`);
  }
  console.log();
  
  // Demo 7: Collection Management
  console.log('📊 Demo 7: Collection Registry');
  console.log('==============================');
  
  const registry = localCollection.all();
  console.log('Active collections:');
  for (const [name, collection] of registry) {
    const docs = await collection.getAll();
    console.log(`  • ${name}: ${docs.length} documents`);
  }
  console.log();
  
  // Demo 8: Remote Operations
  console.log('🌐 Demo 8: Remote Operations');
  console.log('============================');
  
  const remoteEvents: any[] = [];
  products.addEventListener('change', (e) => {
    const detail = (e as CustomEvent).detail;
    if (detail.remote) {
      remoteEvents.push(detail);
    }
  });
  
  // Simulate remote change (won't emit change event)
  await products.put({
    id: 'remote-1',
    name: 'Remote Product',
    price: 99.99,
    category: 'Remote'
  }, { remote: true });
  
  console.log(`Remote events captured: ${remoteEvents.length}`);
  console.log('Remote product added (no local event emitted)');
  
  const remoteProduct = await products.get('remote-1');
  console.log('Remote product retrieved:', remoteProduct?.name);
  console.log();
  
  // Demo 9: Performance & Stats
  console.log('📈 Demo 9: Performance Stats');
  console.log('============================');
  
  const startTime = Date.now();
  
  // Batch operations
  const batchSize = 100;
  console.log(`Adding ${batchSize} items...`);
  
  for (let i = 0; i < batchSize; i++) {
    await sessionData.put({
      id: `item-${i}`,
      name: `Test Item ${i}`,
      value: Math.random()
    });
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`Completed in ${duration}ms (${(duration / batchSize).toFixed(2)}ms per item)`);
  
  const finalCount = await sessionData.getAll();
  console.log(`Session collection now has ${finalCount.length} items`);
  console.log();
  
  // Demo 10: Cleanup
  console.log('🧹 Demo 10: Cleanup');
  console.log('===================');
  
  // Unsubscribe
  unsubscribe();
  console.log('Unsubscribed from products collection');
  
  // Clear a collection
  await sessionData.clear();
  console.log('Cleared session data');
  
  // Close all collections
  await localCollection.close();
  console.log('Closed all collections');
  
  console.log('\n✨ Demo completed! LocalStore is working perfectly.');
}

// Run the demo
comprehensiveDemo().catch(console.error);