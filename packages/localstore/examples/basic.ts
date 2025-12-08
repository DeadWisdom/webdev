/**
 * Basic example of LocalStore usage
 */

import { localCollection, memory, timestamps } from '../src/index.ts';

async function main() {
  console.log('LocalStore Basic Example\n');
  
  // Create a collection with memory storage and timestamps
  const todos = await localCollection('todos',
    timestamps(),
    memory()
  );
  
  console.log('Created "todos" collection with timestamps and memory storage\n');
  
  // Add some todos
  await todos.put({
    id: '1',
    title: 'Build LocalStore',
    completed: false,
    priority: 'high'
  });
  
  await todos.put({
    id: '2', 
    title: 'Write documentation',
    completed: false,
    priority: 'medium'
  });
  
  await todos.put({
    id: '3',
    title: 'Create examples',
    completed: true,
    priority: 'low'
  });
  
  console.log('Added 3 todos\n');
  
  // Get all todos
  const allTodos = await todos.getAll();
  console.log('All todos:');
  for (const todo of allTodos) {
    console.log(`  - [${todo.completed ? 'x' : ' '}] ${todo.title} (${todo.priority}) - Created: ${new Date(todo.createdAt as number).toLocaleTimeString()}`);
  }
  console.log();
  
  // Update a todo
  await todos.put({
    id: '1',
    title: 'Build LocalStore',
    completed: true,
    priority: 'high'
  });
  
  console.log('Marked "Build LocalStore" as completed\n');
  
  // Get the updated todo
  const todo1 = await todos.get('1');
  if (todo1) {
    console.log('Updated todo:');
    console.log(`  Title: ${todo1.title}`);
    console.log(`  Completed: ${todo1.completed}`);
    console.log(`  Created: ${new Date(todo1.createdAt as number).toLocaleString()}`);
    console.log(`  Updated: ${new Date(todo1.updatedAt as number).toLocaleString()}`);
  }
  console.log();
  
  // Subscribe to changes
  console.log('Setting up subscription...\n');
  
  const unsubscribe = todos.subscribe((docs) => {
    console.log(`Collection updated! Now has ${docs.length} todos`);
  });
  
  // Make some changes
  await todos.delete('3');
  console.log('Deleted todo with id "3"\n');
  
  // Add a new todo
  await todos.put({
    id: '4',
    title: 'Deploy to production',
    completed: false,
    priority: 'high'
  });
  console.log('Added new todo\n');
  
  // Clean up
  unsubscribe();
  
  // Global event listening
  localCollection.addEventListener('change', (e) => {
    const detail = (e as CustomEvent).detail;
    console.log(`Global event: ${detail.op} in collection "${detail.collection}"`);
  });
  
  await todos.clear();
  console.log('\nCleared all todos');
  
  // Check final state
  const finalTodos = await todos.getAll();
  console.log(`\nFinal todo count: ${finalTodos.length}`);
  
  // Clean up
  await localCollection.close();
  console.log('\nClosed all collections');
}

// Run the example
main().catch(console.error);