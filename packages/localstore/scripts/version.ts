#!/usr/bin/env bun
/**
 * Version management script
 * Updates package.json version and creates a git tag
 *
 * Usage:
 *   bun run scripts/version.ts <version>
 *   bun run scripts/version.ts patch|minor|major
 */

import { $ } from 'bun';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const packagePath = join(import.meta.dir, '../package.json');

function getCurrentVersion(): string {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
  return pkg.version;
}

function setVersion(version: string) {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
  pkg.version = version;
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

function parseVersion(version: string): [number, number, number] {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version: ${version}`);
  }
  return parts as [number, number, number];
}

function incrementVersion(
  current: string,
  type: 'major' | 'minor' | 'patch'
): string {
  const [major, minor, patch] = parseVersion(current);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error('Usage: bun run scripts/version.ts <version|patch|minor|major>');
    process.exit(1);
  }

  const currentVersion = getCurrentVersion();
  console.log(`Current version: ${currentVersion}`);

  let newVersion: string;

  if (['major', 'minor', 'patch'].includes(arg)) {
    newVersion = incrementVersion(currentVersion, arg as 'major' | 'minor' | 'patch');
  } else {
    // Validate semver format
    if (!/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?(\+[a-z0-9.-]+)?$/i.test(arg)) {
      console.error(`Invalid version format: ${arg}`);
      console.error('Expected: X.Y.Z or X.Y.Z-prerelease or X.Y.Z+build');
      process.exit(1);
    }
    newVersion = arg;
  }

  console.log(`New version: ${newVersion}`);

  // Update package.json
  setVersion(newVersion);
  console.log('✅ Updated package.json');

  // Check if git repo
  try {
    await $`git rev-parse --git-dir`.quiet();

    // Stage the change
    await $`git add package.json`;
    console.log('✅ Staged package.json');

    console.log('\nNext steps:');
    console.log(`  1. Review changes: git diff --cached`);
    console.log(`  2. Commit: git commit -m "chore: bump version to v${newVersion}"`);
    console.log(`  3. Tag: git tag v${newVersion}`);
    console.log(`  4. Push: git push origin main --tags`);
  } catch {
    console.log('⚠️  Not a git repository, skipping git operations');
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
