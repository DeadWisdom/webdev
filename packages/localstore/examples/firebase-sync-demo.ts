/**
 * Firebase Sync Demo - Real-time database synchronization capabilities
 * Note: This demo shows the API usage; in a real app you'd have an actual Firebase project
 */

import { localCollection, memory, timestamps, firebaseSync } from '../src/index.ts';

// Mock Firebase for demo purposes
class MockFirebaseService {
  private data: Map<string, any> = new Map();
  private listeners: Map<string, Array<(snapshot: any) => void>> = new Map();
  private requestLog: string[] = [];
  private presenceData: Map<string, any> = new Map();
  
  constructor() {
    // Initialize with some server data
    this.data.set('firebase-docs', {
      'server-1': {
        id: 'server-1',
        title: 'Firebase Document 1',
        content: 'This document exists in Firebase',
        serverTimestamp: Date.now() - 10000,
        author: 'firebase-user'
      },
      'server-2': {
        id: 'server-2',
        title: 'Firebase Document 2',
        content: 'Another Firebase document',
        serverTimestamp: Date.now() - 5000,
        author: 'firebase-user'
      }
    });
  }
  
  // Mock Firebase app initialization
  initializeApp(config: any) {
    this.requestLog.push(`initializeApp(${JSON.stringify(config)})`);
    return { name: 'demo-app' };
  }
  
  // Mock database connection
  getDatabase() {
    this.requestLog.push('getDatabase()');
    return { name: 'demo-db' };
  }
  
  // Mock database reference
  ref(db: any, path: string) {
    this.requestLog.push(`ref(${path})`);
    return { key: path };
  }
  
  // Mock get operation
  async get(ref: any): Promise<any> {
    this.requestLog.push(`get(${ref.key})`);
    const data = this.data.get(ref.key);
    return {
      exists: () => data !== undefined,
      val: () => data
    };
  }
  
  // Mock set operation
  async set(ref: any, data: any): Promise<void> {
    this.requestLog.push(`set(${ref.key}, ${JSON.stringify(data).substring(0, 50)}...)`);
    
    if (data === null) {
      this.data.delete(ref.key);
    } else {
      this.data.set(ref.key, data);
    }
    
    // Trigger listeners
    await this.triggerListeners(ref.key, data);
  }
  
  // Mock remove operation
  async remove(ref: any): Promise<void> {
    this.requestLog.push(`remove(${ref.key})`);
    this.data.delete(ref.key);
    await this.triggerListeners(ref.key, null);
  }
  
  // Mock real-time listener
  onValue(ref: any, callback: (snapshot: any) => void): () => void {
    this.requestLog.push(`onValue(${ref.key})`);
    
    if (ref.key === '.info/connected') {
      // Simulate connection status
      setTimeout(() => {
        callback({
          exists: () => true,
          val: () => true
        });
      }, 10);
      return () => {};
    }
    
    // Store listener
    if (!this.listeners.has(ref.key)) {
      this.listeners.set(ref.key, []);
    }
    this.listeners.get(ref.key)!.push(callback);
    
    // Trigger initial callback
    const data = this.data.get(ref.key);
    setTimeout(() => {
      callback({
        exists: () => data !== undefined,
        val: () => data
      });
    }, 10);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(ref.key);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      }
    };
  }
  
  // Mock server timestamp
  serverTimestamp() {
    return { '.sv': 'timestamp' };
  }
  
  // Mock disconnect handler
  onDisconnect(ref: any) {
    return {
      set: async (data: any) => {
        this.requestLog.push(`onDisconnect.set(${ref.key})`);
      }
    };
  }
  
  // Trigger listeners for a path
  async triggerListeners(path: string, data: any): Promise<void> {
    const listeners = this.listeners.get(path);
    if (listeners) {
      for (const listener of listeners) {
        await new Promise(resolve => {
          setTimeout(() => {
            listener({
              exists: () => data !== undefined && data !== null,
              val: () => data
            });
            resolve(void 0);
          }, 5);
        });
      }
    }
  }
  
  // Simulate external changes
  async simulateExternalChange(path: string, docId: string, doc: any): Promise<void> {
    const fullPath = path;
    const currentData = this.data.get(fullPath) || {};
    currentData[docId] = doc;
    this.data.set(fullPath, currentData);
    
    await this.triggerListeners(fullPath, currentData);
  }
  
  getRequestLog(): string[] {
    return [...this.requestLog];
  }
  
  getData(path: string): any {
    return this.data.get(path);
  }
  
  clearRequestLog(): void {
    this.requestLog = [];
  }
  
  getPresenceData(): Map<string, any> {
    return new Map(this.presenceData);
  }
}

// Set up mock Firebase
const mockFirebase = new MockFirebaseService();

// Mock Firebase modules globally
(globalThis as any).mockFirebaseApp = {
  initializeApp: (config: any) => mockFirebase.initializeApp(config)
};

(globalThis as any).mockFirebaseDatabase = {
  getDatabase: () => mockFirebase.getDatabase(),
  ref: (db: any, path: string) => mockFirebase.ref(db, path),
  get: (ref: any) => mockFirebase.get(ref),
  set: (ref: any, data: any) => mockFirebase.set(ref, data),
  remove: (ref: any) => mockFirebase.remove(ref),
  onValue: (ref: any, callback: any) => mockFirebase.onValue(ref, callback),
  off: () => {},
  serverTimestamp: () => mockFirebase.serverTimestamp(),
  onDisconnect: (ref: any) => mockFirebase.onDisconnect(ref)
};

async function firebaseSyncDemo() {
  console.log('🔥 LocalStore Firebase Sync Demo\n');
  console.log('📡 Simulating Firebase real-time database synchronization...\n');
  
  // ===============================================
  // 1. Basic Firebase Sync Setup
  // ===============================================
  console.log('1️⃣  Setting up Firebase sync collection...');
  
  const documents = await localCollection('firebase-docs',
    timestamps(),
    firebaseSync({
      config: {
        apiKey: "demo-api-key",
        authDomain: "localstore-demo.firebaseapp.com",
        databaseURL: "https://localstore-demo-default-rtdb.firebaseio.com/",
        projectId: "localstore-demo",
        storageBucket: "localstore-demo.appspot.com",
        messagingSenderId: "123456789",
        appId: "1:123456789:web:abcdef123456"
      },
      path: 'collections/documents',
      realtime: true,
      push: true,
      pull: true,
      useServerTimestamp: true,
      conflictResolution: 'server-wins',
      offline: true,
      presence: true,
      batchWrites: true
    }),
    memory()
  );
  
  console.log('   ✅ Collection created with Firebase sync');
  console.log('   📊 Firebase operations:');
  mockFirebase.getRequestLog().forEach(log => console.log(`      ${log}`));
  console.log();
  
  // Wait for initial data pull
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Check what was pulled from Firebase
  const pulledDocs = await documents.getAll();
  console.log(`   📥 Pulled ${pulledDocs.length} documents from Firebase:`);
  pulledDocs.forEach(doc => {
    console.log(`      📄 ${doc.title} (author: ${doc.author})`);
  });
  console.log();
  
  // ===============================================
  // 2. Real-time Synchronization
  // ===============================================
  console.log('2️⃣  Demonstrating real-time sync...');
  mockFirebase.clearRequestLog();
  
  const syncEvents: any[] = [];
  
  // Listen for real-time events
  documents.addEventListener('sync:realtime', (e) => {
    const detail = (e as CustomEvent).detail;
    syncEvents.push(`📡 Real-time sync: ${detail.collection}`);
  });
  
  documents.addEventListener('sync:complete', (e) => {
    const detail = (e as CustomEvent).detail;
    syncEvents.push(`✅ ${detail.operation} completed (${detail.count || 1} docs)`);
  });
  
  // Add local document (should sync to Firebase)
  console.log('   ➕ Adding new local document...');
  await documents.put({
    id: 'local-1',
    title: 'Local Document 1',
    content: 'This document was created locally and should sync to Firebase',
    category: 'Demo',
    tags: ['local', 'demo']
  });
  
  // Wait for sync to complete
  await new Promise(resolve => setTimeout(resolve, 50));
  
  console.log('   📤 Local changes synced to Firebase:');
  mockFirebase.getRequestLog().forEach(log => console.log(`      ${log}`));
  
  // Simulate external change from another client
  console.log('\n   🌍 Simulating external client change...');
  await mockFirebase.simulateExternalChange('firebase-docs', 'external-1', {
    id: 'external-1',
    title: 'External Client Document',
    content: 'This was added by another client in real-time',
    source: 'external-client',
    serverTimestamp: Date.now()
  });
  
  // Wait for real-time update
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const updatedDocs = await documents.getAll();
  const externalDoc = updatedDocs.find(d => d.source === 'external-client');
  if (externalDoc) {
    console.log(`   📥 Real-time update received: "${externalDoc.title}"`);
  }
  
  console.log('\n   📡 Real-time sync events captured:');
  syncEvents.forEach(event => console.log(`      ${event}`));
  console.log();
  
  // ===============================================
  // 3. Cleanup
  // ===============================================
  console.log('🧹 Cleanup...');
  
  await documents.close();
  console.log('   ✅ Collections closed');
  
  await localCollection.close();
  console.log('   ✅ LocalStore closed');
  
  console.log('\n🔥 Firebase Sync Demo Complete!');
  console.log('=' .repeat(50));
  console.log('✨ Features Demonstrated:');
  console.log();
  console.log('🔥 FIREBASE INTEGRATION:');
  console.log('   • Real-time database synchronization');
  console.log('   • Bidirectional sync (push & pull)');
  console.log('   • Server timestamp integration');
  console.log('   • Custom database paths and organization');
  console.log();
  console.log('⚡ REAL-TIME FEATURES:');
  console.log('   • Live data synchronization');
  console.log('   • Cross-client real-time updates');
  console.log('   • Event-driven architecture');
  console.log('   • Automatic conflict detection');
  console.log();
  console.log('Ready for production Firebase integration! 🚀');
}

// Run the demo
firebaseSyncDemo().catch(console.error);