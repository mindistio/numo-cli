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

  it('tolerates a leading v and missing parts', () => {
    expect(semverGt('v1.2.0', '1.1.0')).toBe(true);
    expect(semverGt('1.2', '1.1.9')).toBe(true);
    expect(semverGt('1.0', '1.0.0')).toBe(false);
  });
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
