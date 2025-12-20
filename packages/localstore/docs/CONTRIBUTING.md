# Contributing to LocalStore

Thank you for your interest in contributing to LocalStore! This guide will help you get started.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later
- Git

### Getting Started

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/webdev.git
cd webdev/packages/localstore
```

2. **Install dependencies**

```bash
bun install
```

3. **Install git hooks**

```bash
bunx lefthook install
```

4. **Run tests to verify setup**

```bash
bun test
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes

Follow these guidelines:

- **Code Style**: Run `bun run format` before committing
- **Type Safety**: Ensure TypeScript types are correct (`bun run typecheck`)
- **Tests**: Add tests for new features or bug fixes
- **Documentation**: Update README or docs as needed

### 3. Run Quality Checks

```bash
# Run all checks at once
bun run check

# Or individually:
bun run typecheck  # Type checking
bun run lint       # Linting
bun run format     # Formatting
bun test           # Unit tests
bun run test:browser  # Browser tests
```

### 4. Build

```bash
bun run build
```

Verify that:
- Build completes without errors
- Bundle sizes are reasonable
- No unexpected warnings

### 5. Commit Your Changes

The pre-commit hook will automatically run linting, formatting, and type checking.

```bash
git add .
git commit -m "feat: add awesome feature"
```

#### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```
feat: add Firebase sync plugin
fix: resolve memory leak in IndexedDB plugin
docs: update API documentation for search plugin
test: add tests for validation plugin
```

### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Project Structure

```
packages/localstore/
├── src/
│   ├── collection.ts          # Core Collection class
│   ├── registry.ts            # Global collection registry
│   ├── types.ts               # TypeScript type definitions
│   ├── core.ts                # Core exports only
│   ├── index.ts               # Main entry point
│   ├── plugins/
│   │   ├── storage/           # Storage plugins
│   │   │   ├── memory.ts
│   │   │   └── indexeddb.ts
│   │   ├── sync/              # Sync plugins
│   │   │   ├── broadcast.ts
│   │   │   ├── http.ts
│   │   │   └── firebase.ts
│   │   ├── search/            # Search plugins
│   │   │   └── flexsearch.ts
│   │   ├── transform/         # Transform plugins
│   │   │   ├── timestamps.ts
│   │   │   └── validate.ts
│   │   └── queue.ts           # Offline queue
│   └── components/            # Web components
│       ├── local-data.ts
│       ├── local-query.ts
│       └── local-debug.ts
├── scripts/
│   ├── build.ts               # Build script
│   └── version.ts             # Version management
├── examples/                  # Example applications
├── dist/                      # Build output (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Writing Tests

### Unit Tests (Bun)

Create test files with `.test.ts` suffix:

```typescript
// src/plugins/storage/memory.test.ts
import { test, expect, describe, beforeEach } from 'bun:test';
import { memory } from './memory';
import { Collection } from '../../collection';

describe('Memory Plugin', () => {
  let collection: Collection;

  beforeEach(() => {
    collection = new Collection('test', [memory()]);
  });

  test('should store and retrieve items', async () => {
    await collection.put({ id: '1', name: 'Test' });
    const item = await collection.get('1');
    expect(item).toEqual({ id: '1', name: 'Test' });
  });
});
```

Run tests:
```bash
bun test                      # All tests
bun test src/collection.test.ts  # Specific file
bun test --watch              # Watch mode
```

### Browser Tests

Create test files with `.browser-test.ts` suffix:

```typescript
// src/components/local-data.browser-test.ts
import { expect } from '@esm-bundle/chai';

describe('local-data component', () => {
  it('should parse JSON data', () => {
    const element = document.createElement('local-data');
    document.body.appendChild(element);

    // Test implementation

    document.body.removeChild(element);
  });
});
```

Run browser tests:
```bash
bun run test:browser
```

## Writing Plugins

Plugins follow a middleware pattern:

```typescript
import type { Plugin } from '../types';

export function myPlugin(options = {}): Plugin {
  return {
    name: 'my-plugin',

    async install(collection) {
      // Setup code - runs once when plugin is installed
      // Access collection methods, add event listeners, etc.
    },

    async get(id, next) {
      // Intercept get operations
      const doc = await next(id);
      // Transform or validate the result
      return doc;
    },

    async put(doc, options, next) {
      // Intercept put operations
      // Transform the document before storing
      const transformedDoc = { ...doc, timestamp: Date.now() };
      return next(transformedDoc, options);
    },

    async delete(id, next) {
      // Intercept delete operations
      return next(id);
    },

    async getAll(next) {
      // Intercept getAll operations
      return next();
    },

    async clear(next) {
      // Intercept clear operations
      return next();
    },
  };
}
```

### Plugin Guidelines

1. **Single Responsibility**: Each plugin should do one thing well
2. **Composability**: Plugins should work well together
3. **Type Safety**: Provide TypeScript types
4. **Error Handling**: Handle errors gracefully
5. **Documentation**: Document options and behavior
6. **Tests**: Write comprehensive tests
7. **Performance**: Avoid blocking operations

## Code Style

### TypeScript

- Use strict TypeScript settings
- Prefer `interface` over `type` for object shapes
- Use `const` instead of `let` when possible
- Avoid `any` - use proper types

### Naming Conventions

- **Files**: kebab-case (`my-plugin.ts`)
- **Classes**: PascalCase (`Collection`)
- **Functions**: camelCase (`localCollection`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`)

### Imports

- Use relative imports within the package
- Group imports: external libraries, then internal modules
- Sort imports alphabetically within groups

```typescript
// External
import { Database } from 'firebase/database';

// Internal
import { Collection } from './collection';
import type { Plugin } from './types';
```

## Documentation

### Code Comments

- Use JSDoc for public APIs
- Explain "why" not "what"
- Keep comments up to date

```typescript
/**
 * Creates a new collection with the specified plugins
 * @param name - Unique identifier for the collection
 * @param plugins - Array of plugins to apply
 * @returns Collection instance
 */
export function localCollection(name: string, plugins: Plugin[] = []) {
  // Implementation
}
```

### README Updates

Update the README when:
- Adding new features
- Changing public APIs
- Adding new plugins
- Updating examples

## Performance Considerations

- Avoid synchronous operations in hot paths
- Use IndexedDB for large datasets
- Implement lazy loading where appropriate
- Profile before optimizing
- Keep bundle sizes small

## Browser Compatibility

LocalStore targets modern browsers:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Use modern JavaScript/TypeScript features. Don't add polyfills unless necessary.

## Release Process

Releases are handled by maintainers:

1. Version bump (`bun run version`)
2. Update CHANGELOG
3. Create GitHub Release
4. Automated publish to NPM via GitHub Actions

## Questions?

- Check existing issues and discussions
- Review documentation in `/docs`
- Ask in GitHub Discussions

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Follow GitHub's Community Guidelines

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to LocalStore! 🎉
