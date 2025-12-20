# Build Pipeline Documentation

This document describes the complete build pipeline for LocalStore.

## Overview

The build pipeline includes:

- **Build System**: Bun-based build with multiple output bundles
- **Quality Checks**: TypeScript, ESLint, Prettier
- **Testing**: Unit tests (Bun) and browser tests (Web Test Runner)
- **CI/CD**: GitHub Actions workflows for testing and publishing
- **Git Hooks**: Pre-commit and pre-push validation via Lefthook
- **Bundle Validation**: Automated size checks

## Quick Start

```bash
# Install dependencies
bun install

# Run full quality check
bun run check

# Build for production
bun run build

# Build for development (faster, with inline sourcemaps)
bun run build:dev

# Build and watch for changes
bun run build:watch

# Run tests
bun test
bun run test:browser
bun run test:all  # Both unit and browser tests
```

## Build Scripts

### Production Build

```bash
bun run build
```

This creates optimized, minified bundles in the `dist/` directory:

- `dist/index.js` - Main bundle with all exports
- `dist/core.js` - Core only (Collection, registry, types)
- `dist/plugins/storage.js` - Storage plugins (memory, IndexedDB)
- `dist/plugins/sync.js` - Sync plugins (broadcast, HTTP, Firebase)
- `dist/plugins/search.js` - Search plugin (FlexSearch)
- `dist/plugins/transform.js` - Transform plugins (timestamps, validation)
- `dist/plugins/queue.js` - Offline queue
- `dist/components.js` - Web components

Each bundle includes:
- TypeScript declarations (`.d.ts` files)
- Source maps (`.js.map` files)
- Minified code
- Tree-shakeable ESM exports

### Development Build

```bash
bun run build:dev
```

Development builds are faster and include:
- No minification
- Inline source maps
- Skip bundle size validation

### Watch Mode

```bash
bun run build:watch
```

Automatically rebuilds on file changes.

## Quality Checks

### Type Checking

```bash
bun run typecheck
```

Validates TypeScript types without emitting files.

### Linting

```bash
bun run lint        # Check for issues
bun run lint:fix    # Auto-fix issues
```

ESLint configuration includes:
- TypeScript-specific rules
- Prettier integration
- Custom rules for unused vars, console usage, etc.

### Formatting

```bash
bun run format        # Format all files
bun run format:check  # Check formatting without changes
```

Uses Prettier with custom configuration.

### Full Check

```bash
bun run check
```

Runs typecheck + lint + format:check in sequence.

## Testing

### Unit Tests (Bun)

```bash
bun test              # Run once
bun test --watch      # Watch mode
```

Tests are written using Bun's built-in test runner.

### Browser Tests

```bash
bun run test:browser
```

Runs tests in actual browsers using Web Test Runner with Playwright.

### All Tests

```bash
bun run test:all
```

Runs both unit and browser tests.

## Version Management

### Update Version

```bash
# Semantic version bump
bun run version patch   # 1.0.0 -> 1.0.1
bun run version minor   # 1.0.0 -> 1.1.0
bun run version major   # 1.0.0 -> 2.0.0

# Specific version
bun run version 1.2.3

# Pre-release versions
bun run version 1.2.3-beta.1
bun run version 1.2.3-alpha.1
```

The version script:
1. Updates `package.json`
2. Stages the change in git
3. Provides next steps for commit and tag

## Git Hooks (Lefthook)

### Pre-commit

Runs automatically before each commit:
- Linting (parallel)
- Format checking (parallel)
- Type checking

To skip hooks (not recommended):
```bash
git commit --no-verify
```

### Pre-push

Runs automatically before pushing:
- Full test suite

### Installing Hooks

```bash
bun add -d lefthook
bunx lefthook install
```

## CI/CD Workflows

### CI Workflow (`.github/workflows/ci.yml`)

Triggered on:
- Push to `main` branch
- Pull requests to `main`

Jobs:
1. **Test**: Type check, lint, format check, unit tests, browser tests
2. **Build**: Creates production build and verifies outputs
3. **Size Check**: Validates bundle sizes against limits

### Publish Workflow (`.github/workflows/publish.yml`)

Triggered on:
- GitHub releases (automatic)
- Manual workflow dispatch

Jobs:
1. **Publish**: Runs checks, builds, and publishes to NPM
2. **Publish Dry Run**: Runs on PRs to validate package

#### Manual Publishing

1. Go to GitHub Actions
2. Select "Publish Package" workflow
3. Click "Run workflow"
4. Enter version (e.g., `1.0.0`) and NPM tag (`latest`, `next`, `beta`, `alpha`)
5. Click "Run workflow"

The workflow will:
- Update version in `package.json`
- Run all quality checks
- Build production bundles
- Publish to NPM
- Create git tag
- Push tag to repository

#### Setup Required

Add `NPM_TOKEN` to GitHub repository secrets:
1. Create NPM access token at https://www.npmjs.com/settings/tokens
2. Add to GitHub: Settings → Secrets and variables → Actions → New repository secret
3. Name: `NPM_TOKEN`
4. Value: Your NPM token

## Bundle Size Limits

The build enforces size limits for critical bundles:

| Bundle | Limit (gzipped) |
|--------|-----------------|
| core   | 5 KB            |
| main   | 20 KB           |

If limits are exceeded, the production build fails.

To check bundle sizes:

```bash
bun run build
# Sizes are displayed in the build output
```

## Build Output Structure

```
dist/
├── index.js              # Main bundle
├── index.js.map          # Source map
├── index.d.ts            # Type declarations
├── core.js               # Core bundle
├── core.d.ts
├── plugins/
│   ├── storage.js        # Storage plugins
│   ├── storage.d.ts
│   ├── sync.js           # Sync plugins
│   ├── sync.d.ts
│   ├── search.js         # Search plugin
│   ├── search.d.ts
│   ├── transform.js      # Transform plugins
│   ├── transform.d.ts
│   └── queue.js          # Queue plugin
│       └── queue.d.ts
└── components.js         # Web components
    └── components.d.ts
```

## Package Exports

The `package.json` defines exports for tree-shaking:

```javascript
import { localCollection } from 'localstore';              // Main
import { Collection } from 'localstore/core';              // Core only
import { memory, indexedDB } from 'localstore/plugins/storage';
import { broadcast, httpSync } from 'localstore/plugins/sync';
import { flexSearch } from 'localstore/plugins/search';
import { timestamps, validate } from 'localstore/plugins/transform';
import 'localstore/components';                            // Web components
```

## Publishing Checklist

Before publishing a new version:

1. ✅ All tests pass (`bun run test:all`)
2. ✅ No linting errors (`bun run lint`)
3. ✅ Code is formatted (`bun run format:check`)
4. ✅ Types are valid (`bun run typecheck`)
5. ✅ Build succeeds (`bun run build`)
6. ✅ Bundle sizes are acceptable
7. ✅ CHANGELOG is updated
8. ✅ Version is bumped (`bun run version`)
9. ✅ Commit and tag created
10. ✅ Pushed to GitHub

Then either:
- Create a GitHub Release (triggers automatic publish)
- Run the Publish workflow manually

## Troubleshooting

### Build Fails with Type Errors

```bash
# Check for type errors
bun run typecheck

# Sometimes cleaning helps
rm -rf dist node_modules
bun install
bun run build
```

### Bundle Size Too Large

1. Check what's included: Use a bundle analyzer
2. Ensure peer dependencies are marked as `external`
3. Check for duplicate dependencies
4. Consider code splitting or lazy loading

### Tests Fail

```bash
# Run tests with verbose output
bun test --verbose

# Run specific test file
bun test src/collection.test.ts

# Browser tests with headed mode for debugging
npx web-test-runner --manual --open
```

### Git Hooks Not Running

```bash
# Reinstall hooks
bunx lefthook install

# Check hook configuration
cat .git/hooks/pre-commit
```

## Performance Tips

1. **Use watch mode during development**: `bun run build:watch`
2. **Skip hooks when needed**: `git commit --no-verify` (use sparingly)
3. **Run tests in watch mode**: `bun test --watch`
4. **Use development builds**: `bun run build:dev`

## Environment Variables

The build script uses:

- `NODE_ENV`: Set to `production` in minified builds, `development` otherwise

In your code, you can use:

```typescript
if (process.env.NODE_ENV === 'production') {
  // Production-only code
}
```

This will be stripped from development builds.

## Continuous Integration

The CI pipeline runs on every push and pull request:

1. **Test Job**: Validates code quality
2. **Build Job**: Ensures builds succeed
3. **Size Check Job**: Validates bundle sizes

PRs cannot be merged if CI fails.

## Dependencies

### Production Dependencies

None! LocalStore has zero runtime dependencies.

### Peer Dependencies (Optional)

- `firebase` - Required for Firebase sync plugin
- `flexsearch` - Required for search plugin
- `zod` - Required for validation plugin
- `typescript` - For type checking

### Dev Dependencies

- `@types/bun` - TypeScript types for Bun
- `@typescript-eslint/*` - ESLint TypeScript support
- `eslint` - Linting
- `prettier` - Code formatting
- `lefthook` - Git hooks
- `@web/test-runner` - Browser testing
- `fake-indexeddb` - IndexedDB mocking for tests

## Advanced: Custom Build Configuration

To customize the build, edit `scripts/build.ts`:

```typescript
const entries: BuildEntry[] = [
  {
    name: 'custom',
    entry: './src/custom.ts',
    outfile: './dist/custom.js',
    external: ['dependency-to-exclude'],
  },
];
```

Then update `package.json` exports:

```json
"./custom": {
  "types": "./dist/custom.d.ts",
  "import": "./dist/custom.js"
}
```

## Support

For issues with the build pipeline:

1. Check this documentation
2. Review CI logs on GitHub Actions
3. Open an issue with build output and environment details
