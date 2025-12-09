/**
 * Search Demo - showcasing FlexSearch capabilities
 */

import { localCollection, memory, flexSearch, timestamps } from '../src/index.ts';

async function searchDemo() {
  console.log('🔍 LocalStore FlexSearch Demo\n');
  
  // Create a collection with search capabilities
  console.log('📚 Setting up document collection with search...');
  const docs = await localCollection('documents',
    timestamps(),
    flexSearch(['title', 'content', 'tags', 'author']),
    memory()
  );
  
  // Add sample documents
  console.log('📝 Adding sample documents...\n');
  
  const sampleDocs = [
    {
      id: '1',
      title: 'Getting Started with JavaScript',
      content: 'JavaScript is a programming language that allows you to create interactive web pages. This guide covers the fundamentals of JS including variables, functions, and DOM manipulation.',
      author: 'John Smith',
      tags: 'javascript programming tutorial beginner',
      category: 'Programming'
    },
    {
      id: '2',
      title: 'Advanced React Patterns',
      content: 'Learn advanced React patterns including Higher-Order Components, Render Props, and Hooks. These patterns will help you build more maintainable React applications.',
      author: 'Sarah Johnson',
      tags: 'react javascript frontend patterns advanced',
      category: 'Frontend'
    },
    {
      id: '3',
      title: 'Node.js Backend Development',
      content: 'Building robust backend applications with Node.js and Express. Cover topics like routing, middleware, database integration, and API design best practices.',
      author: 'Mike Wilson',
      tags: 'nodejs backend express api development',
      category: 'Backend'
    },
    {
      id: '4',
      title: 'CSS Grid Layout Guide',
      content: 'CSS Grid is a powerful layout system in CSS. Learn how to create complex, responsive layouts with grid properties, areas, and responsive design techniques.',
      author: 'Emily Davis',
      tags: 'css grid layout responsive design',
      category: 'Design'
    },
    {
      id: '5',
      title: 'Python Data Analysis',
      content: 'Analyze data with Python using pandas, numpy, and matplotlib. This guide covers data cleaning, visualization, and statistical analysis for data science.',
      author: 'David Chen',
      tags: 'python data analysis pandas numpy science',
      category: 'Data Science'
    },
    {
      id: '6',
      title: 'TypeScript Best Practices',
      content: 'TypeScript adds static typing to JavaScript, helping catch errors early and improve code quality. Learn best practices for types, interfaces, and generics.',
      author: 'Lisa Rodriguez',
      tags: 'typescript javascript types static typing',
      category: 'Programming'
    },
    {
      id: '7',
      title: 'Vue.js Component Architecture',
      content: 'Building scalable Vue.js applications with proper component architecture. Covers composition API, state management, and component communication patterns.',
      author: 'Alex Kim',
      tags: 'vuejs javascript frontend components architecture',
      category: 'Frontend'
    },
    {
      id: '8',
      title: 'Database Design Principles',
      content: 'Learn fundamental database design principles including normalization, indexing, and query optimization. Essential knowledge for backend developers.',
      author: 'Robert Taylor',
      tags: 'database design sql normalization indexing',
      category: 'Backend'
    }
  ];
  
  // Add documents one by one to show indexing
  for (const doc of sampleDocs) {
    await docs.put(doc);
    console.log(`  ✅ Added: "${doc.title}"`);
  }
  
  console.log(`\n📊 Total documents: ${sampleDocs.length}\n`);
  
  // Demo different search queries
  console.log('🔍 Search Examples:\n');
  console.log('=' .repeat(50));
  
  // 1. Simple keyword search
  console.log('\n1️⃣  Simple Search: "JavaScript"');
  let results = await docs.search('JavaScript');
  console.log(`   Found ${results.length} results:`);
  results.forEach(result => {
    console.log(`   📄 ${result.title} (by ${result.author})`);
  });
  
  // 2. Search in content
  console.log('\n2️⃣  Content Search: "patterns"');
  results = await docs.search('patterns');
  console.log(`   Found ${results.length} results:`);
  results.forEach(result => {
    console.log(`   📄 ${result.title}`);
    // Show snippet of matching content
    const content = result.content as string;
    const index = content.toLowerCase().indexOf('patterns');
    if (index !== -1) {
      const start = Math.max(0, index - 30);
      const end = Math.min(content.length, index + 50);
      const snippet = content.substring(start, end);
      console.log(`      "...${snippet}..."`);
    }
  });
  
  // 3. Search by author
  console.log('\n3️⃣  Author Search: "Smith"');
  results = await docs.search('Smith');
  console.log(`   Found ${results.length} results:`);
  results.forEach(result => {
    console.log(`   📄 ${result.title} by ${result.author}`);
  });
  
  // 4. Tag-based search
  console.log('\n4️⃣  Tag Search: "frontend"');
  results = await docs.search('frontend');
  console.log(`   Found ${results.length} results:`);
  results.forEach(result => {
    console.log(`   📄 ${result.title} [${result.tags}]`);
  });
  
  // 5. Technology search
  console.log('\n5️⃣  Technology Search: "React"');
  results = await docs.search('React');
  console.log(`   Found ${results.length} results:`);
  results.forEach(result => {
    console.log(`   📄 ${result.title} - ${result.category}`);
  });
  
  // 6. Search with limit
  console.log('\n6️⃣  Limited Search: "programming" (limit: 2)');
  results = await docs.search('programming', { limit: 2 });
  console.log(`   Found ${results.length} results (limited to 2):`);
  results.forEach(result => {
    console.log(`   📄 ${result.title}`);
  });
  
  // 7. Field-specific search
  console.log('\n7️⃣  Field-Specific Search: "development" in title only');
  results = await docs.search('development', { fields: ['title'] });
  console.log(`   Found ${results.length} results:`);
  results.forEach(result => {
    console.log(`   📄 ${result.title}`);
  });
  
  // 8. Complex search terms
  console.log('\n8️⃣  Complex Search: "data analysis"');
  results = await docs.search('data analysis');
  console.log(`   Found ${results.length} results:`);
  results.forEach(result => {
    console.log(`   📄 ${result.title} by ${result.author}`);
  });
  
  console.log('\n' + '=' .repeat(50));
  
  // Demo real-time search updates
  console.log('\n📡 Real-time Search Updates Demo:\n');
  
  // Add a new document
  console.log('➕ Adding new document about Machine Learning...');
  await docs.put({
    id: '9',
    title: 'Machine Learning with Python',
    content: 'Introduction to machine learning algorithms using Python, scikit-learn, and TensorFlow for data science projects.',
    author: 'Dr. Anna Zhang',
    tags: 'machine learning python tensorflow scikit-learn AI',
    category: 'AI/ML'
  });
  
  // Search should now include the new document
  results = await docs.search('machine learning');
  console.log(`   🔍 Search "machine learning": ${results.length} results`);
  results.forEach(result => {
    console.log(`   📄 ${result.title}`);
  });
  
  // Update an existing document
  console.log('\n✏️  Updating React document to mention machine learning...');
  const reactDoc = await docs.get('2');
  if (reactDoc) {
    await docs.put({
      ...reactDoc,
      content: reactDoc.content + ' Modern React applications can also integrate machine learning models for intelligent user experiences.'
    });
  }
  
  // Search should now find the updated document
  results = await docs.search('machine learning');
  console.log(`   🔍 Search "machine learning": ${results.length} results (after update)`);
  results.forEach(result => {
    console.log(`   📄 ${result.title}`);
  });
  
  // Delete a document
  console.log('\n🗑️  Deleting TypeScript document...');
  await docs.delete('6');
  
  // Search should no longer find the deleted document
  results = await docs.search('TypeScript');
  console.log(`   🔍 Search "TypeScript": ${results.length} results (after deletion)`);
  
  // Performance test
  console.log('\n⚡ Performance Test:\n');
  
  // Add many documents for performance testing
  console.log('📦 Adding 100 test documents for performance testing...');
  const startTime = Date.now();
  
  for (let i = 1; i <= 100; i++) {
    await docs.put({
      id: `perf-${i}`,
      title: `Performance Test Document ${i}`,
      content: `This is test document number ${i} for performance testing. It contains various keywords like test, performance, document, and number for search testing.`,
      author: `Test Author ${i % 5 + 1}`,
      tags: `test performance document-${i}`,
      category: 'Test'
    });
  }
  
  const addTime = Date.now() - startTime;
  console.log(`   ⏱️  Added 100 documents in ${addTime}ms (${(addTime / 100).toFixed(2)}ms per document)`);
  
  // Performance search test
  const searchStart = Date.now();
  results = await docs.search('performance');
  const searchTime = Date.now() - searchStart;
  
  console.log(`   🔍 Search "performance" in ${results.length + 8} documents: ${searchTime}ms`);
  console.log(`   📊 Found ${results.length} results`);
  
  // Category analysis
  console.log('\n📈 Search Analytics:\n');
  
  const categories = ['Programming', 'Frontend', 'Backend', 'Design', 'Data Science', 'AI/ML'];
  for (const category of categories) {
    const categoryResults = await docs.search(category);
    console.log(`   📂 ${category}: ${categoryResults.length} documents`);
  }
  
  console.log('\n✨ Search demo completed!');
  console.log('🎯 FlexSearch Features Demonstrated:');
  console.log('  • Full-text search across multiple fields');
  console.log('  • Real-time index updates');
  console.log('  • Field-specific searching');
  console.log('  • Search result limiting');
  console.log('  • Performance with large document sets');
  console.log('  • Author, content, and tag searching');
  
  // Cleanup
  await docs.close();
}

// Run the demo
searchDemo().catch(console.error);