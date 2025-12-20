/**
 * Build script for LocalStore
 *
 * Creates multiple bundles:
 * - dist/index.js - Main bundle with all exports
 * - dist/core.js - Core only (Collection, registry, types)
 * - dist/plugins/storage.js - Storage plugins (memory, indexeddb)
 * - dist/plugins/sync.js - Sync plugins (broadcast, http, firebase)
 * - dist/plugins/search.js - Search plugins (flexsearch)
 * - dist/plugins/transform.js - Transform plugins (timestamps, validate)
 * - dist/components.js - Web components (browser-only)
 */

import { $ } from 'bun';
import { homedir } from 'os';
import { join } from 'path';

const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev');
const isProduction = !isDev && !isWatch;

interface BuildEntry {
  name: string;
  entry: string;
  outfile: string;
  external?: string[];
}

// Optional peer dependencies - not bundled
const peerDeps = ['firebase', 'firebase/*', 'flexsearch', 'zod'];

const entries: BuildEntry[] = [
  // Main bundle - everything except components
  {
    name: 'main',
    entry: './src/index.ts',
    outfile: './dist/index.js',
    external: peerDeps,
  },
  // Core only
  {
    name: 'core',
    entry: './src/core.ts',
    outfile: './dist/core.js',
  },
  // Storage plugins
  {
    name: 'storage',
    entry: './src/plugins/storage/index.ts',
    outfile: './dist/plugins/storage.js',
    external: ['../..'],
  },
  // Sync plugins
  {
    name: 'sync',
    entry: './src/plugins/sync/index.ts',
    outfile: './dist/plugins/sync.js',
    external: [...peerDeps, '../..'],
  },
  // Search plugins
  {
    name: 'search',
    entry: './src/plugins/search/index.ts',
    outfile: './dist/plugins/search.js',
    external: [...peerDeps, '../..'],
  },
  // Transform plugins
  {
    name: 'transform',
    entry: './src/plugins/transform/index.ts',
    outfile: './dist/plugins/transform.js',
    external: [...peerDeps, '../..'],
  },
  // Web components (browser-only)
  {
    name: 'components',
    entry: './src/components/index.ts',
    outfile: './dist/components.js',
    external: ['../registry', '../plugins/storage/memory'],
  },
  // Queue (standalone)
  {
    name: 'queue',
    entry: './src/plugins/queue.ts',
    outfile: './dist/plugins/queue.js',
  },
];

async function build() {
  const startTime = performance.now();

  console.log(`🔨 Building LocalStore... ${isProduction ? '(production)' : '(development)'}\n`);

  // Clean dist directory
  await $`rm -rf ./dist`;
  await $`mkdir -p ./dist/plugins`;

  // Create missing entry point files if needed
  await createEntryPoints();

  // Build each entry
  for (const entry of entries) {
    console.log(`  📦 Building ${entry.name}...`);

    try {
      const result = await Bun.build({
        entrypoints: [entry.entry],
        outdir: '.',
        naming: entry.outfile.replace('./', ''),
        format: 'esm',
        minify: isProduction,
        sourcemap: isProduction ? 'linked' : 'inline',
        target: 'browser',
        external: entry.external,
        // Production optimizations
        splitting: false, // Disable code splitting for library bundles
        define: {
          'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
        },
      });

      if (!result.success) {
        console.error(`  ❌ Failed to build ${entry.name}:`);
        for (const log of result.logs) {
          console.error(`     ${log}`);
        }
        if (isProduction) {
          throw new Error(`Build failed for ${entry.name}`);
        }
      } else {
        // Get file size
        const file = Bun.file(entry.outfile);
        const size = file.size;
        const sizeKb = (size / 1024).toFixed(2);
        console.log(`     ✅ ${entry.outfile} (${sizeKb} KB)`);
      }
    } catch (error) {
      console.error(`  ❌ Error building ${entry.name}:`, error);
      if (isProduction) {
        throw error;
      }
    }
  }

  // Generate TypeScript declarations
  console.log('\n  📝 Generating type declarations...');
  try {
    await $`bunx tsc --emitDeclarationOnly --declaration --outDir ./dist`;
    console.log('     ✅ Type declarations generated');
  } catch (error) {
    console.warn('     ⚠️  Type declarations generation had warnings (this is often okay)');
    if (isProduction) {
      console.error('Type generation failed in production mode');
      throw error;
    }
  }

  const endTime = performance.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n✨ Build complete in ${duration}s!\n`);

  // Print bundle summary
  await printBundleSummary();

  // Validate bundle sizes in production
  if (isProduction) {
    await validateBundleSizes();
  }
}

async function createEntryPoints() {
  // Create core.ts if it doesn't exist
  const coreContent = `/**
 * Core exports only - no plugins
 */
export { localCollection } from './registry.ts';
export { Collection } from './collection.ts';
export type {
  Doc,
  Plugin,
  WriteOptions,
  SearchOptions,
  MethodName,
  ChangeEvent,
  Collection as CollectionType,
  LocalCollectionAPI
} from './types.ts';
`;
  await Bun.write('./src/core.ts', coreContent);

  // Create storage plugin index if it doesn't exist
  const storageContent = `export { memory } from './memory.ts';
export { indexedDB } from './indexeddb.ts';
`;
  await Bun.write('./src/plugins/storage/index.ts', storageContent);

  // Create sync plugin index if it doesn't exist
  const syncContent = `export { broadcast } from './broadcast.ts';
export { httpSync } from './http.ts';
export { firebaseSync } from './firebase.ts';
`;
  await Bun.write('./src/plugins/sync/index.ts', syncContent);

  // Create search plugin index if it doesn't exist
  const searchContent = `export { flexSearch } from './flexsearch.ts';
`;
  await Bun.write('./src/plugins/search/index.ts', searchContent);

  // Create transform plugin index if it doesn't exist
  const transformContent = `export { timestamps } from './timestamps.ts';
export { validate, commonSchemas, schemaBuilders, validationMiddleware } from './validate.ts';
`;
  await Bun.write('./src/plugins/transform/index.ts', transformContent);
}

async function printBundleSummary() {
  console.log('📊 Bundle Summary:');
  console.log('─'.repeat(60));
  console.log(`   ${'Bundle'.padEnd(18)} ${'Size'.padStart(10)}  ${'Gzipped'.padStart(10)}`);
  console.log('─'.repeat(60));

  let totalSize = 0;
  let totalGzip = 0;

  for (const entry of entries) {
    try {
      const file = Bun.file(entry.outfile);
      const content = await file.arrayBuffer();
      const size = content.byteLength;
      totalSize += size;

      // Calculate gzip size
      const gzipped = Bun.gzipSync(new Uint8Array(content));
      const gzipSize = gzipped.byteLength;
      totalGzip += gzipSize;

      const sizeKb = (size / 1024).toFixed(2);
      const gzipKb = (gzipSize / 1024).toFixed(2);
      const paddedName = entry.name.padEnd(18);
      console.log(`   ${paddedName} ${sizeKb.padStart(8)} KB  ${gzipKb.padStart(8)} KB`);
    } catch {
      // File may not exist if build failed
    }
  }

  console.log('─'.repeat(60));
  console.log(`   ${'Total'.padEnd(18)} ${(totalSize / 1024).toFixed(2).padStart(8)} KB  ${(totalGzip / 1024).toFixed(2).padStart(8)} KB`);
  console.log('');
}

async function validateBundleSizes() {
  console.log('🔍 Validating bundle sizes...\n');

  const limits = {
    core: 5 * 1024, // 5KB gzipped
    main: 20 * 1024, // 20KB gzipped
  };

  let hasViolations = false;

  for (const entry of entries) {
    const limit = limits[entry.name as keyof typeof limits];
    if (!limit) continue;

    try {
      const file = Bun.file(entry.outfile);
      const content = await file.arrayBuffer();
      const gzipped = Bun.gzipSync(new Uint8Array(content));
      const gzipSize = gzipped.byteLength;

      if (gzipSize > limit) {
        console.error(
          `   ❌ ${entry.name}: ${(gzipSize / 1024).toFixed(2)} KB exceeds limit of ${(limit / 1024).toFixed(2)} KB`
        );
        hasViolations = true;
      } else {
        console.log(
          `   ✅ ${entry.name}: ${(gzipSize / 1024).toFixed(2)} KB (limit: ${(limit / 1024).toFixed(2)} KB)`
        );
      }
    } catch (error) {
      console.error(`   ⚠️  Could not validate ${entry.name}`);
    }
  }

  console.log('');

  if (hasViolations) {
    console.error('❌ Bundle size validation failed!');
    throw new Error('Bundle size limits exceeded');
  } else {
    console.log('✅ All bundles within size limits');
  }
}

// Run build
build().catch(console.error);
