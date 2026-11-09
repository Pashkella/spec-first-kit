// SessionStart (startup, /clear, compaction): a few lines on where the work stands. Stdout goes into the context
// in both Claude Code and Codex. Keep it short: every line here is paid for in every session.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir, git, loadConfig } from './lib.mjs';

const dir = projectDir();
const out = [];

const branch = git(dir, ['branch', '--show-current'])?.trim();
if (branch) {
  const dirty = (git(dir, ['status', '--porcelain']) || '').split('\n').filter(Boolean).length;
  out.push(`Branch: ${branch}${dirty ? `, ${dirty} uncommitted file(s)` : ''}${branch.startsWith('spike/') ? ' (spike: throwaway, never merge)' : ''}`);
}

const changes = join(dir, 'openspec', 'changes');
if (existsSync(changes)) {
  const names = readdirSync(changes, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'archive').map((e) => e.name);
  if (names.length > 3) out.push(`${names.length} changes in progress (\`openspec list\`); first 3:`);
  for (const name of names.slice(0, 3)) {
    const tasksPath = join(changes, name, 'tasks.md');
    if (!existsSync(tasksPath)) {
      out.push(`Change in progress: ${name} (planning, no tasks yet)`);
      continue;
    }
    const lines = readFileSync(tasksPath, 'utf8').split(/\r?\n/);
    const open = lines.filter((l) => /^\s*- \[ \]/.test(l));
    const done = lines.filter((l) => /^\s*- \[[xX]\]/.test(l)).length;
    out.push(`Change in progress: ${name} (${done}/${done + open.length} tasks)${open[0] ? ` next: ${open[0].replace(/^\s*- \[ \]\s*/, '')}` : ''}`);
  }
}

// With nothing in progress, point at the next planned change (docs/product/roadmap.md is written by the intake skill).
if (!out.some((l) => l.startsWith('Change in progress'))) {
  try {
    const next = readFileSync(join(dir, 'docs', 'product', 'roadmap.md'), 'utf8').split(/\r?\n/).find((l) => /^\s*- \[ \]/.test(l));
    if (next) out.push(`Next on the roadmap: ${next.replace(/^\s*- \[ \]\s*/, '').slice(0, 160)}`);
  } catch { /* no roadmap */ }
}

try {
  if (readFileSync(join(dir, 'AGENTS.md'), 'utf8').includes('<project name>')) {
    out.push('spec-first-kit is not configured yet: suggest running /onboard.');
  }
} catch { /* no AGENTS.md */ }

// The Codex copies and the package settings stubs are generated from .claude/; a stale one runs an old harness.
const cfg = loadConfig(dir);
if (cfg.codex === true || cfg.packages?.length) {
  try {
    const { stale } = await import('../skills/onboard/scripts/sync.mjs');
    const files = stale(dir);
    if (files.length) out.push(`Generated harness files are stale (${files.length}): run \`node .claude/skills/onboard/scripts/sync.mjs\`.`);
  } catch { /* script missing: doctor reports it */ }
}

if (out.length) console.log(out.join('\n'));
