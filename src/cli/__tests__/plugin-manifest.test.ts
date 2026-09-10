import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const readJson = (p: string) => JSON.parse(read(p));

// Agent Plugins v1 (https://agent-plugins.org): root `plugin.json` plus `skills/`.
// `.claude-plugin/plugin.json` is the same package for Claude Code, which reads its own
// manifest path; both share the one `skills/` directory.
const PLUGIN_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const VERSIONED_MANIFESTS = ['plugin.json', '.claude-plugin/plugin.json'];

describe('plugin manifests', () => {
  const plugin = readJson('plugin.json');

  // Contract: the package ships one version number. Clients read `version` for update
  // checks and cache freshness (spec §5.4), and a stale one is invisible from inside the
  // repo — the hand-written `version:` in SKILL.md sat at 1.5.0 through three releases.
  // Every manifest that names a version, not the first one.
  it('declare the same version as package.json', () => {
    const expected = readJson('package.json').version;
    for (const path of VERSIONED_MANIFESTS) {
      expect(readJson(path).version, `${path} is out of step with package.json`).toBe(expected);
    }
  });

  // Contract: the plugin declares Agent Plugins v1. A client that does not recognize
  // `$schema` MUST reject the whole plugin (spec §5.2) — a typo here does not degrade
  // gracefully, it uninstalls the plugin from every conforming client at once.
  it('target the canonical Agent Plugins v1 schema', () => {
    expect(plugin.$schema).toBe(PLUGIN_SCHEMA_ID);
  });

  // Invariant: the v1 manifest schema is closed (spec §5.2). A field outside this set is
  // reported and ignored, so it is dead weight that reads like configuration —
  // client-specific data belongs under `extensions`.
  it('keep plugin.json inside the closed v1 field set', () => {
    const allowed = ['$schema', 'name', 'version', 'description', 'author', 'homepage',
      'repository', 'license', 'keywords', 'extensions'];
    expect(Object.keys(plugin).filter((k) => !allowed.includes(k))).toEqual([]);
  });

  // Contract: §5.5, asserted one constraint at a time so a failure names the rule it
  // broke. An illegal name is a rejected plugin, not a warning.
  it('use a spec-legal plugin name', () => {
    expect(plugin.name).toMatch(/^[a-z0-9][a-z0-9.-]*$/); // charset, alphanumeric start
    expect(plugin.name).toMatch(/[a-z0-9]$/); //              alphanumeric end
    expect(plugin.name).not.toMatch(/--|\.\./); //            no repeated separators
    expect(plugin.name.length).toBeLessThanOrEqual(64);
  });
});

describe('bundled skills', () => {
  // Only top-level `key: value` lines. A blank line or the children of a spec-legal
  // `metadata:` block would otherwise parse as a phantom key and fail the closed-set
  // check below for a skill that is in fact valid.
  const frontmatter = (md: string): Record<string, string> => {
    const block = md.match(/^---\n([\s\S]*?)\n---\n/);
    if (!block) throw new Error('SKILL.md has no YAML frontmatter');
    const fields = block[1]
      .split('\n')
      .map((line) => line.match(/^([\w-]+):[ \t]*(.*)$/))
      .filter((m): m is RegExpMatchArray => m !== null);
    return Object.fromEntries(fields.map((m) => [m[1], m[2]]));
  };

  // Read from disk rather than listed here, so a second skill cannot be added without
  // being checked. The list comes from the filesystem, so TESTING.md rule 3 applies and
  // each test below asserts it is non-empty — a broken traversal returns no skills, and
  // every property over an empty list holds.
  const skillDirs = readdirSync(join(process.cwd(), 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  // Contract: a client discovers a skill only as an immediate child of `skills/` holding
  // a `SKILL.md` (Agent Plugins §7.1), and never searches deeper.
  it('are discoverable at skills/<name>/SKILL.md', () => {
    expect(skillDirs.length).toBeGreaterThan(0);
    for (const dir of skillDirs) {
      const path = `skills/${dir}/SKILL.md`;
      expect(existsSync(join(process.cwd(), path)), `${path} is missing — no client will load it`).toBe(true);
    }
  });

  // Contract: a client MUST skip a skill whose frontmatter breaks the Agent Skills spec,
  // and it does so silently as far as the plugin author can tell — which is why `version`
  // (not a field that spec defines) is worth failing a build over.
  it('conform to the Agent Skills frontmatter spec', () => {
    expect(skillDirs.length).toBeGreaterThan(0);
    for (const dir of skillDirs) {
      const fm = frontmatter(read(`skills/${dir}/SKILL.md`));

      // The rule is `name` equals the parent directory, not any particular name.
      expect(fm.name, `skills/${dir}/SKILL.md`).toBe(dir);
      expect(fm.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(fm.name).toMatch(/[a-z0-9]$/);
      expect(fm.name).not.toMatch(/--/);
      expect(fm.name.length).toBeLessThanOrEqual(64);

      // `description` is the whole of what a client loads before activating the skill.
      const description = fm.description ?? '';
      expect(description.length, `${dir}: description is empty`).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(1024);

      const allowed = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
      expect(Object.keys(fm).filter((k) => !allowed.includes(k)), `skills/${dir}/SKILL.md`).toEqual([]);
    }
  });
});
