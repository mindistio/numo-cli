import { describe, it, expect } from 'vitest';
import { getAgentGuide } from '../guide';

describe('getAgentGuide', () => {
  // In tests (no esbuild __AGENTS_MD__ define) this reads AGENTS.md from the
  // repo root — the same fallback path dev mode uses.
  it('returns the AGENTS.md agent contract', () => {
    const guide = getAgentGuide();
    expect(guide).toContain('numo-cli for AI Agents');
    expect(guide).toContain('tasks create');
    expect(guide.length).toBeGreaterThan(500);
  });
});
