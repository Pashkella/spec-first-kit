// PreToolUse on Codex file edits (apply_patch): applies the Edit(...) and Write(...) entries of permissions.deny in
// .claude/settings.json, which Claude Code enforces by itself. sync.mjs wires it into .codex/hooks.json only, and
// setup.mjs installs it only with --codex.
// Patterns are repo-relative globs: * stays within one folder, ** crosses folders.
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readInput, projectDir, editedPaths, block } from './lib.mjs';

const input = readInput();
const dir = projectDir();
let deny = [];
try { deny = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8')).permissions?.deny || []; } catch { process.exit(0); }

const glob = (g) => new RegExp(`^${g.split('**').map((part) => part.split('*')
  .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')}$`);
const rules = deny.map((d) => d.match(/^(?:Edit|Write)\((?:\.\/)?([^/~][^)]*)\)$/)?.[1]).filter(Boolean)
  .map((g) => [g, glob(g)]);

for (const file of editedPaths(input, dir)) {
  const rel = relative(dir, file).replace(/\\/g, '/');
  const hit = rules.find(([, re]) => re.test(rel));
  if (hit) {
    block('PreToolUse', `Blocked by .claude/hooks/protect.mjs: ${rel} matches Edit(${hit[0]}) in permissions.deny of .claude/settings.json.`
      + `${/^\.(agents|codex)\//.test(rel) ? ' This is a generated Codex copy: edit .claude/ and run node .claude/skills/onboard/scripts/sync.mjs.' : ''}`);
  }
}
process.exit(0);
