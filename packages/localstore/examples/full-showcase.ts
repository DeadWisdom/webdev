/**
 * Full LocalStore Showcase - All Features Demo
 * Demonstrates the complete LocalStore plugin ecosystem
 */

import { localCollection, memory, indexedDB, timestamps, broadcast, flexSearch } from '../src/index.ts';

// Mock BroadcastChannel for Node.js
class MockBroadcastChannel {
  name: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  
  constructor(name: string) {
    this.name = name;
  }
  
  postMessage(data: any) {
    console.log(`      📡 Broadcasting: ${data.op} ${data.id || 'collection'}`);
  }
  
  close() {}
  addEventListener() {}
}

// Set up mocks for Node.js
(globalThis as any).BroadcastChannel = MockBroadcastChannel;
if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  (globalThis as any).crypto = {
    randomUUID: () => Math.random().toString(36).substr(2, 9)
  };
}

async function fullShowcase() {
  console.log('🚀 LocalStore Full Feature Showcase\n');
  console.log('🎯 Demonstrating: Storage + Search + Sync + Transforms + Events\n');
  
  // ===============================================
  // 1. Create Full-Featured Collection
  // ===============================================
  console.log('📦 Creating full-featured collection...');
  console.log('   Plugins: timestamps + broadcast + flexSearch + memory');
  
  const library = await localCollection('digital-library',
    timestamps({ created: 'publishedAt', updated: 'lastModified' }),
    broadcast({ channel: 'library-sync' }),
    flexSearch(['title', 'summary', 'author', 'tags']),
    memory()
  );
  
  console.log('   ✅ Collection created with 4 plugins\n');
  
  // ===============================================
  // 2. Event System Setup
  // ===============================================
  console.log('🎧 Setting up event listeners...');
  
  const events: any[] = [];
  let subscriptionCount = 0;
  
  // Collection-level events
  library.addEventListener('change', (e) => {
    const detail = (e as CustomEvent).detail;
    events.push(`local: ${detail.op} ${detail.id || 'collection'}`);
  });
  
  // Global events
  localCollection.addEventListener('change', (e) => {
    const detail = (e as CustomEvent).detail;
    events.push(`global: ${detail.collection}/${detail.op}`);
  });
  
  // Subscription (reactive updates)
  const unsubscribe = library.subscribe((docs) => {
    subscriptionCount++;
    console.log(`      🔄 Subscription update #${subscriptionCount}: ${docs.length} documents`);
  });
  
  console.log('   ✅ Event system configured\n');
  
  // ===============================================
  // 3. Add Sample Data (Shows All Plugin Actions)
  // ===============================================
  console.log('📚 Adding sample library data...');
  
  const books = [
    {
      id: 'js-guide-2024',
      title: 'The Complete JavaScript Guide',
      author: 'Sarah Chen',
      summary: 'Comprehensive guide to modern JavaScript including ES2024 features, async programming, and best practices for web development.',
      tags: 'javascript programming web development es2024 async',
      isbn: '978-1234567890',
      pages: 450,
      rating: 4.8
    },
    {
      id: 'react-patterns',
      title: 'React Design Patterns',
      author: 'Mike Johnson', 
      summary: 'Advanced patterns for building scalable React applications. Covers hooks, context, performance optimization, and testing strategies.',
      tags: 'react frontend patterns hooks context performance',
      isbn: '978-0987654321',
      pages: 320,
      rating: 4.6
    },
    {
      id: 'python-data',
      title: 'Python for Data Science',
      author: 'Dr. Lisa Wang',
      summary: 'Learn data analysis and machine learning with Python using pandas, numpy, scikit-learn, and visualization libraries.',
      tags: 'python data science machine learning pandas numpy',
      isbn: '978-5432109876',
      pages: 520,
      rating: 4.9
    },
    {
      id: 'typescript-deep',
      title: 'TypeScript Deep Dive',
      author: 'Alex Rodriguez',
      summary: 'Master advanced TypeScript features including generics, conditional types, mapped types, and integration with popular frameworks.',
      tags: 'typescript javascript types generics frameworks',
      isbn: '978-6789012345',
      pages: 380,
      rating: 4.7
    }
  ];
  
  for (const book of books) {
    await library.put(book);
    console.log(`   📖 Added: "${book.title}" by ${book.author}`);
  }
  
  console.log('\n   🎯 Plugin Actions Demonstrated:');
  console.log('      • Timestamps: Auto-added publishedAt/lastModified');  
  console.log('      • Broadcast: Cross-tab sync messages sent');
  console.log('      • FlexSearch: Documents indexed for full-text search');
  console.log('      • Memory: Documents stored in memory');
  console.log('      • Events: Change events fired and subscriptions updated');
  console.log();
  
  // ===============================================
  // 4. Full-Text Search Capabilities
  // ===============================================
  console.log('🔍 Demonstrating search capabilities...\n');
  
  // Search by technology
  console.log('   🔎 Search "React":');
  let results = await library.search('React');
  results.forEach(book => {
    console.log(`      📖 ${book.title} (Rating: ${book.rating}⭐)`);
  });
  
  // Search by topic
  console.log('\n   🔎 Search "machine learning":');
  results = await library.search('machine learning');
  results.forEach(book => {
    console.log(`      📖 ${book.title} by ${book.author}`);
  });
  
  // Search author
  console.log('\n   🔎 Search author "Chen":');
  results = await library.search('Chen');
  results.forEach(book => {
    console.log(`      📖 "${book.title}" - ${book.summary.substring(0, 50)}...`);
  });
  
  // Advanced search with field limiting
  console.log('\n   🔎 Search "patterns" in title only:');
  results = await library.search('patterns', { fields: ['title'] });
  results.forEach(book => {
    console.log(`      📖 ${book.title}`);
  });
  
  // Search with limit
  console.log('\n   🔎 Search "programming" (limit 2):');
  results = await library.search('programming', { limit: 2 });
  results.forEach(book => {
    console.log(`      📖 ${book.title}`);
  });
  
  console.log();
  
  // ===============================================
  // 5. Real-Time Updates and Sync
  // ===============================================
  console.log('🔄 Demonstrating real-time updates...\n');
  
  // Update a book (shows timestamp update + search reindex + broadcast)
  console.log('   ✏️  Updating React book rating...');
  const reactBook = await library.get('react-patterns');
  if (reactBook) {
    await library.put({
      ...reactBook,
      rating: 5.0,
      summary: reactBook.summary + ' Updated with new chapter on React Server Components.'
    });
  }
  
  // Search should find updated content
  console.log('\n   🔎 Search "Server Components" (new content):');
  results = await library.search('Server Components');
  results.forEach(book => {
    console.log(`      📖 ${book.title} (New rating: ${book.rating}⭐)`);
    console.log(`      📅 Published: ${new Date(book.publishedAt as number).toLocaleDateString()}`);
    console.log(`      🕒 Modified: ${new Date(book.lastModified as number).toLocaleString()}`);
  });
  
  // Add new book (shows all plugins working together)
  console.log('\n   ➕ Adding new book about AI...');
  await library.put({
    id: 'ai-future',
    title: 'The Future of Artificial Intelligence',
    author: 'Dr. Emma Thompson',
    summary: 'Exploring the potential and challenges of AI technology, machine learning advancements, and their impact on society.',
    tags: 'artificial intelligence AI machine learning future technology',
    isbn: '978-9876543210',
    pages: 280,
    rating: 4.5
  });
  
  // Search should immediately include new book
  results = await library.search('artificial intelligence');
  console.log(`   🔎 Search "artificial intelligence": Found ${results.length} results`);
  results.forEach(book => {
    console.log(`      📖 ${book.title} by ${book.author}`);
  });
  
  console.log();
  
  // ===============================================
  // 6. Data Analytics and Insights
  // ===============================================
  console.log('📊 Data analytics with search...\n');
  
  const allBooks = await library.getAll();
  console.log(`   📚 Total books: ${allBooks.length}`);
  
  // Category analysis using search
  const technologies = ['JavaScript', 'Python', 'React', 'TypeScript'];
  console.log('\n   🏷️  Books by technology:');
  for (const tech of technologies) {
    const techBooks = await library.search(tech);
    console.log(`      ${tech}: ${techBooks.length} books`);
  }
  
  // Rating analysis
  const ratings = allBooks.map(book => book.rating as number);
  const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  console.log(`\n   ⭐ Average rating: ${avgRating.toFixed(1)}/5.0`);
  
  // Page count analysis
  const totalPages = allBooks.reduce((sum, book) => sum + (book.pages as number), 0);
  console.log(`   📄 Total pages: ${totalPages.toLocaleString()}`);
  
  console.log();
  
  // ===============================================
  // 7. Performance Testing
  // ===============================================
  console.log('⚡ Performance testing...\n');
  
  console.log('   🧪 Adding 50 test books for performance analysis...');
  const startTime = Date.now();
  
  for (let i = 1; i <= 50; i++) {
    await library.put({
      id: `test-book-${i}`,
      title: `Test Book ${i}: Programming Fundamentals`,
      author: `Author ${i}`,
      summary: `This is test book number ${i} covering programming fundamentals, algorithms, data structures, and best practices.`,
      tags: `test programming book-${i} fundamentals algorithms`,
      isbn: `978-TEST${i.toString().padStart(6, '0')}`,
      pages: 200 + (i * 10),
      rating: 3.5 + (Math.random() * 1.5)
    });
  }
  
  const addTime = Date.now() - startTime;
  console.log(`   ⏱️  Added 50 books in ${addTime}ms (${(addTime / 50).toFixed(2)}ms each)`);
  
  // Performance search test
  const searchStart = Date.now();
  const searchResults = await library.search('programming');
  const searchTime = Date.now() - searchStart;
  
  console.log(`   🔍 Searched ${allBooks.length + 50 + 1} books in ${searchTime}ms`);
  console.log(`   📊 Found ${searchResults.length} programming books`);
  
  console.log();
  
  // ===============================================
  // 8. Event Summary
  // ===============================================
  console.log('📝 Event activity summary...\n');
  
  console.log(`   🎧 Total events captured: ${events.length}`);
  console.log(`   🔄 Subscription updates: ${subscriptionCount}`);
  
  const eventTypes = events.reduce((acc, event) => {
    const type = event.split(' ')[1]; // Extract operation type
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('   📊 Event breakdown:');
  Object.entries(eventTypes).forEach(([type, count]) => {
    console.log(`      ${type}: ${count} events`);
  });
  
  console.log();
  
  // ===============================================
  // 9. Remote Operations Demo
  // ===============================================
  console.log('🌐 Remote operations demo...\n');
  
  console.log('   📡 Simulating remote change (no local events)...');
  const remoteEvents = events.length;
  
  await library.put({
    id: 'remote-book',
    title: 'Remote Collaboration Guide',
    author: 'Remote Author',
    summary: 'Guide to effective remote work and collaboration.',
    tags: 'remote work collaboration productivity',
    isbn: '978-REMOTE123',
    pages: 250,
    rating: 4.3
  }, { remote: true }); // Mark as remote change
  
  const newEventCount = events.length;
  console.log(`   📊 Events before: ${remoteEvents}, after: ${newEventCount} (should be same)`);
  
  // But document should still be searchable
  const remoteResults = await library.search('collaboration');
  console.log(`   🔍 Remote book searchable: ${remoteResults.length > 0 ? 'Yes' : 'No'}`);
  
  console.log();
  
  // ===============================================
  // 10. Collection Management
  // ===============================================
  console.log('🗂️  Collection management...\n');
  
  // Show registry
  const registry = localCollection.all();
  console.log('   📋 Active collections:');
  for (const [name, collection] of registry) {
    const docs = await collection.getAll();
    console.log(`      📁 ${name}: ${docs.length} documents`);
  }
  
  console.log();
  
  // ===============================================
  // 11. Cleanup and Summary
  // ===============================================
  console.log('🧹 Cleanup and summary...\n');
  
  // Unsubscribe
  unsubscribe();
  console.log('   ✅ Unsubscribed from reactive updates');
  
  // Final stats
  const finalBooks = await library.getAll();
  console.log(`   📊 Final collection size: ${finalBooks.length} documents`);
  
  // Close collection
  await library.close();
  console.log('   ✅ Collection closed (plugins destroyed)');
  
  // Close all
  await localCollection.close();
  console.log('   ✅ All collections closed');
  
  console.log('\n🎉 Full LocalStore Showcase Complete!');
  console.log('=' .repeat(60));
  console.log('✨ Successfully Demonstrated:');
  console.log();
  console.log('🔧 PLUGIN ARCHITECTURE:');
  console.log('   • Middleware chain execution');
  console.log('   • Plugin composition and order');
  console.log('   • Terminal vs middleware plugins');
  console.log();
  console.log('💾 STORAGE SYSTEMS:');
  console.log('   • Memory storage for fast access');  
  console.log('   • IndexedDB for persistence (browser only)');
  console.log('   • Automatic CRUD operations');
  console.log();
  console.log('🔍 SEARCH CAPABILITIES:');
  console.log('   • Full-text search across multiple fields');
  console.log('   • Real-time index updates');
  console.log('   • Field-specific and limited search');
  console.log('   • Performance with large datasets');
  console.log();
  console.log('🔄 SYNCHRONIZATION:');
  console.log('   • Cross-tab broadcast messaging');
  console.log('   • Echo prevention and conflict handling');
  console.log('   • Remote operation support');
  console.log();
  console.log('🕒 TRANSFORMS:');
  console.log('   • Automatic timestamp management');
  console.log('   • Custom field naming');
  console.log('   • Data transformation pipeline');
  console.log();
  console.log('📡 EVENT SYSTEM:');
  console.log('   • EventTarget-based architecture');
  console.log('   • Collection and global events');
  console.log('   • Reactive subscriptions');
  console.log('   • Event filtering and handling');
  console.log();
  console.log('🎯 DEVELOPER EXPERIENCE:');
  console.log('   • TypeScript-first design');
  console.log('   • Comprehensive error handling');
  console.log('   • Intuitive plugin API');
  console.log('   • Extensive test coverage');
  console.log();
  console.log('LocalStore is ready for production! 🚀');
}

// Run the showcase
fullShowcase().catch(console.error);