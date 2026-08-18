import { describe, it, expect } from 'vitest';
import { semverGt, upgradeCommand } from '../update-check';

describe('semverGt', () => {
  it('compares major/minor/patch', () => {
    expect(semverGt('1.2.0', '1.1.9')).toBe(true);
    expect(semverGt('2.0.0', '1.9.9')).toBe(true);
    expect(semverGt('1.0.1', '1.0.0')).toBe(true);
    expect(semverGt('1.0.0', '1.0.0')).toBe(false);
    expect(semverGt('1.0.0', '1.0.1')).toBe(false);
    expect(semverGt('1.9.0', '2.0.0')).toBe(false);
  });

  // No case for a 'v' prefix or a two-part version: both inputs are full semver by
  // construction — one from the registry, one from package.json at build time.
});

describe('upgradeCommand', () => {
  it('suggests npm for a Node (npm/npx) install', () => {
    expect(upgradeCommand(false)).toBe('npm i -g numo-cli');
  });

  it('suggests the install script for a standalone (Bun) binary', () => {
    expect(upgradeCommand(true)).toContain('install.sh | bash');
    expect(upgradeCommand(true)).not.toContain('npm');
  });
});
