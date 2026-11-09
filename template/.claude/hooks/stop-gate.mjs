// Stop: the agent cannot finish its turn while typecheck (and, in "tests" mode, the full unit suite) fail.
// Runs only when code changed since the last passing check, so questions and planning turns cost nothing.
// A stop after a fix is checked again. The gate blocks at most `stopGateRetries` times in one stop sequence
// (default 1). After that, or when the agent stops again without changing code, the turn ends and the user sees a
// warning that the check is still red. It never loops forever. It stays out of spike/ branches.
// Idea from humanlayer/humanlayer (Apache-2.0); first version in efp3d-sandbox.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readInput, projectDir, loadConfig, git, run, tail, block, warnUser } from './lib.mjs';

const input = readInput();
const dir = projectDir();
const cfg = loadConfig(dir);
const mode = cfg.stopGate || 'off';
if (mode === 'off') process.exit(0);
// A spike is throwaway code that skips tests on purpose (sdd/explore.md); nothing from it merges.
if (git(dir, ['branch', '--show-current'])?.trim().startsWith('spike/')) process.exit(0);

// Only code counts: specs, docs, markdown, the harness and the generated Codex copies do not trigger the gate.
const scope = ['--', '.', ':(exclude)openspec', ':(exclude)docs', ':(exclude)*.md', ':(exclude).claude',
  ':(exclude).agents', ':(exclude).codex'];
const status = git(dir, ['status', '--porcelain', ...scope]);
if (!status?.trim()) process.exit(0); // not a git repo, or nothing changed

// New files by content (size and mtime miss an edit within the timestamp resolution); files over 1 MiB by metadata.
const sha1 = (data) => createHash('sha1').update(data).digest('hex');
const untracked = (git(dir, ['ls-files', '--others', '--exclude-standard', ...scope]) || '')
  .split('\n').filter(Boolean)
  .map((f) => {
    try {
      const s = statSync(join(dir, f));
      return s.size <= 1_048_576 ? `${f}:${sha1(readFileSync(join(dir, f)))}` : `${f}:${s.size}:${s.mtimeMs}`;
    } catch { return f; }
  });
const fingerprint = sha1(`${status}\n${git(dir, ['diff', 'HEAD', ...scope]) || ''}\n${untracked.join('\n')}`);

const cacheDir = join(dir, '.claude', '.cache');
const cacheFile = join(cacheDir, 'stop-gate.json');
let cache = {};
try { cache = JSON.parse(readFileSync(cacheFile, 'utf8')); } catch { /* first run */ }
const save = () => { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cacheFile, JSON.stringify(cache)); };

if (cache.pass === fingerprint) process.exit(0);

// The block before this one in the same stop sequence, if any.
const session = input.session_id || 'unknown';
const last = input.stop_hook_active && cache.fail?.session === session ? cache.fail : null;
if (last?.fingerprint === fingerprint) {
  warnUser(`Stop gate: ${last.check} still fails and nothing changed since the last block; the turn ends with a red check.`);
}

const retries = Number.isInteger(cfg.stopGateRetries) ? cfg.stopGateRetries : 1;
const checks = [['typecheck', cfg.typecheck]];
if (mode === 'tests') checks.push(['tests', cfg.tests]);
for (const [name, command] of checks) {
  if (!command) continue;
  const { ok, output } = run(dir, command, 540_000);
  if (!ok) {
    const count = (last?.count || 0) + 1;
    cache.fail = { session, count, fingerprint, check: name };
    save();
    if (count > retries) {
      warnUser(`Stop gate: ${name} still fails (\`${command}\`) after ${retries} retr${retries === 1 ? 'y' : 'ies'}; the turn ends with a red check.`);
    }
    block('Stop', `Stop gate: ${name} failed (\`${command}\`). Fix it, or tell the user why it cannot be fixed now.\n${tail(output, 30)}`);
  }
}

cache = { pass: fingerprint };
save();
process.exit(0);
