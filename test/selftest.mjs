#!/usr/bin/env node
// Self-test for spec-first-kit: installs the kit into temporary projects and runs every script the way Claude Code
// and Codex would. Runs on Windows, macOS and Linux (CI runs all three). Needs git; OpenSpec checks run if the
// openspec CLI is installed.  Usage: node test/selftest.mjs [--keep]
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const root = mkdtempSync(join(tmpdir(), 'sfk-'));
let failed = 0;

const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${String(detail).trim().split('\n').slice(0, 6).join('\n      ')}`}`);
  if (!ok) failed++;
};
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', ...opts });
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const read = (p) => readFileSync(p, 'utf8');
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const setup = (...a) => node([join(KIT, 'setup.mjs'), ...a]);
const hook = (dir, script, input, opts = {}) => {
  const r = node([join(dir, '.claude', 'hooks', script)], { input: JSON.stringify(input), cwd: opts.cwd || dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...(opts.env || {}) } }); // as Claude Code sets it, unless overridden
  return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim(), json: json(r.stdout) };
};
const denied = (r) => r.status === 0 && r.json?.hookSpecificOutput?.permissionDecision === 'deny';
const blocked = (r) => r.status === 0 && r.json?.decision === 'block';
const warned = (r) => r.status === 0 && !r.json?.decision && typeof r.json?.systemMessage === 'string';
const patch = (...lines) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n');
const hasOpenspec = spawnSync('openspec --version', { shell: true, encoding: 'utf8' }).status === 0;

const SCRIPTS = { doctor: '.claude/skills/onboard/scripts/doctor.mjs', sync: '.claude/skills/onboard/scripts/sync.mjs',
  trace: '.claude/skills/sdd/scripts/trace.mjs', snapshot: '.claude/skills/sdd/scripts/snapshot.mjs' };
const doctor = (dir, ...a) => node([join(dir, SCRIPTS.doctor), ...a]);
const cfgFile = (dir) => join(dir, '.claude/sdd.json');
const setConfig = (dir, o) => writeFileSync(cfgFile(dir), JSON.stringify({ ...json(read(cfgFile(dir))), ...o }, null, 2));
const lockOf = (dir) => json(read(join(dir, '.claude/sdd.lock.json')));

// --- A0. Default install: Claude Code only -------------------------------------------------------------------------
const plain = join(root, 'plain');
let r = setup(plain);
check('setup into a new folder, Claude Code only', r.status === 0, r.stderr || r.stdout);
for (const f of ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/sdd.json', '.claude/sdd.lock.json', '.claude/THIRD_PARTY.md',
  SCRIPTS.doctor, SCRIPTS.sync, SCRIPTS.trace, SCRIPTS.snapshot, '.claude/hooks/guard.mjs', 'openspec/config.yaml']) {
  check(`file exists: ${f}`, existsSync(join(plain, f)));
}
for (const f of ['.claude/hooks/protect.mjs', '.agents', '.codex']) {
  check(`no ${f} without --codex`, !existsSync(join(plain, f)));
}
check('sdd.json: codex false, guardRules empty', json(read(cfgFile(plain)))?.codex === false && json(read(cfgFile(plain)))?.guardRules?.length === 0);
check('settings without Codex deny entries', !read(join(plain, '.claude/settings.json')).includes('.codex'));
const plainLock = lockOf(plain);
check('the lock records the kit version and a hash for every kit file', plainLock?.version === json(read(join(KIT, 'package.json'))).version
  && /^[0-9a-f]{64}$/.test(plainLock.files['.claude/hooks/guard.mjs']) && !('.claude/settings.json' in plainLock.files) && !plainLock.generated,
  JSON.stringify(plainLock).slice(0, 300));
check('the AGENTS.md template stays short', read(join(plain, 'AGENTS.md')).split('\n').length <= 55, read(join(plain, 'AGENTS.md')).split('\n').length);
check('the AGENTS.md template has no Codex block', !read(join(plain, 'AGENTS.md')).includes('spec-first-kit:path-rules'));
check('a second run changes nothing', setup(plain).stdout.includes('nothing to do'));

// --- A. New project with Codex -----------------------------------------------------------------------------------
const fresh = join(root, 'fresh');
r = setup(fresh, '--codex');
check('setup into a new folder with --codex', r.status === 0, r.stderr || r.stdout);
for (const f of ['.claude/hooks/protect.mjs', '.claude/skills/intake/SKILL.md',
  '.agents/skills/sdd/SKILL.md', '.agents/skills/intake/SKILL.md', '.agents/skills/onboard/agents/openai.yaml',
  '.codex/agents/implementer.toml', '.codex/hooks.json']) {
  check(`file exists: ${f}`, existsSync(join(fresh, f)));
}
check('--codex: config, deny entries, generated list in the lock, Codex block in AGENTS.md', json(read(cfgFile(fresh))).codex === true
  && read(join(fresh, '.claude/settings.json')).includes('Edit(./.codex/**)') && Object.keys(lockOf(fresh).generated || {}).length > 10
  && read(join(fresh, 'AGENTS.md')).includes('Codex: `.agents/skills/` and `.codex/` are generated'));
git(fresh, 'init', '-q');
git(fresh, 'config', 'user.email', 'selftest@example.com');
git(fresh, 'config', 'user.name', 'selftest');
git(fresh, 'add', '-A');
git(fresh, 'commit', '-qm', 'init');
check('implementer runs on Opus', /^model: opus$/m.test(read(join(fresh, '.claude/agents/implementer.md'))));
check('spec language defaults to English', read(join(fresh, 'openspec/config.yaml')).includes('prose in English'));
r = node([join(fresh, SCRIPTS.sync), '--check']);
check('sync --check: copies current', r.status === 0, r.stdout);
const codexHooks = json(read(join(fresh, '.codex/hooks.json')));
const allCodex = Object.values(codexHooks.hooks).flat().flatMap((g) => g.hooks);
check('every Codex hook has a Windows command', allCodex.length >= 3 && allCodex.every((h) => /^git -c "alias\.kit-hook=!node \.claude\/hooks\/[\w-]+\.mjs" kit-hook$/.test(h.commandWindows || '')),
  JSON.stringify(allCodex, null, 1));
const matchers = (event) => (codexHooks.hooks[event] || []).map((g) => g.matcher);
check('Codex hooks: guard on Bash, protect and formatter on apply_patch, no PowerShell', matchers('PreToolUse').join() === 'Bash,apply_patch'
  && matchers('PostToolUse').join() === 'apply_patch' && !JSON.stringify(codexHooks).includes('PowerShell'), JSON.stringify(codexHooks.hooks));
const toml = read(join(fresh, '.codex/agents/reviewer.toml'));
check('Codex reviewer: effort set, read-only note', toml.includes('model_reasoning_effort = "medium"') && toml.includes('read-only'));

// --- B. guard ---------------------------------------------------------------------------------------------------
for (const c of ['rm -rf /', 'git push --force-with-lease origin x', 'git push origin main', 'git reset --hard HEAD~1',
  'git clean -fd', 'cat .env', 'grep KEY .env.local', 'pnpm publish']) {
  check(`guard blocks: ${c}`, denied(hook(fresh, 'guard.mjs', { tool_name: 'Bash', tool_input: { command: c } })));
}
for (const c of ['Remove-Item -Recurse -Force .', 'Remove-Item . -Recurse', 'rm -Recurse -Force C:\\', 'ri -r ~', 'Get-Content .env', 'gc .\\.env']) {
  check(`guard blocks (PowerShell): ${c}`, denied(hook(fresh, 'guard.mjs', { tool_name: 'PowerShell', tool_input: { command: c } })));
}
check('guard blocks an argv-array command (Codex shape)', denied(hook(fresh, 'guard.mjs', { tool_input: { command: ['bash', '-lc', 'git reset --hard'] } })));
for (const c of ['ls', 'git status', 'rm -rf ./build', 'cat .env.example', 'git push -u origin add-x', 'git rm -r --cached .',
  'Remove-Item -Recurse ./build', 'Get-Content .env.example']) {
  const h = hook(fresh, 'guard.mjs', { tool_input: { command: c } });
  check(`guard allows: ${c}`, h.status === 0 && h.out === '', h.out || h.err);
}
writeFileSync(join(fresh, 'leak.js'), `const k = "${'AKIA'}${'ABCDEFGHIJKLMNOP'}";\n`);
git(fresh, 'add', 'leak.js');
check('guard blocks a commit with a secret', denied(hook(fresh, 'guard.mjs', { tool_input: { command: 'git commit -m x' } })));
check('guard blocks a commit with git -c options', denied(hook(fresh, 'guard.mjs', { tool_input: { command: 'git -c user.name=x commit -m x' } })));
git(fresh, 'rm', '-q', '--cached', 'leak.js');
rmSync(join(fresh, 'leak.js'));
writeFileSync(join(fresh, 'clean.js'), 'export const ok = 1;\n');
git(fresh, 'add', 'clean.js');
git(fresh, 'commit', '-qm', 'clean');
appendFileSync(join(fresh, 'clean.js'), `const k = "${'ghp_'}${'a'.repeat(36)}";\n`);
check('guard blocks a pathspec commit of an unstaged secret', denied(hook(fresh, 'guard.mjs', { tool_input: { command: 'git commit clean.js -m x' } })));
git(fresh, 'checkout', '--', 'clean.js');

// --- B2. guard: uncommitted work, new files, project rules ---------------------------------------------------------
const gd = join(root, 'guard');
setup(gd);
git(gd, 'init', '-q', '-b', 'main');
mkdirSync(join(gd, 'lib'), { recursive: true });
writeFileSync(join(gd, 'lib/tracked.js'), 'export const t = 1;\n');
git(gd, 'add', '-A');
git(gd, '-c', 'user.email=s@e', '-c', 'user.name=s', 'commit', '-qm', 'init');
mkdirSync(join(gd, 'newmod'), { recursive: true });
writeFileSync(join(gd, 'newmod/x.js'), 'new work\n');
mkdirSync(join(gd, '.claude/.cache/tmp'), { recursive: true });
writeFileSync(join(gd, '.claude/.cache/tmp/x'), 'ignored\n');
mkdirSync(join(gd, 'emptied/inner'), { recursive: true });
const guardIn = (command, tool = 'Bash') => hook(gd, 'guard.mjs', { tool_name: tool, tool_input: { command } });
for (const c of ['git checkout .', 'git checkout -- lib/tracked.js', 'git checkout main -- lib', 'git checkout -f main',
  'git switch --discard-changes main', 'git restore lib/tracked.js', 'git restore --staged --worktree .', 'git push origin +main',
  'rm -rf lib', 'rm --recursive --force lib', 'rm -r newmod', 'psql -c "DROP TABLE users"']) {
  check(`guard blocks: ${c}`, denied(guardIn(c)));
}
check('guard blocks (PowerShell): Remove-Item -Recurse -Force lib', denied(guardIn('Remove-Item -Recurse -Force lib', 'PowerShell')));
for (const [c, tool] of [['git checkout -b fix-x'], ['git checkout main'], ['git restore --staged .'], ['grep -rn "DROP TABLE" migrations/'],
  ['git log -S "drop table" --oneline'], ['npm publish --dry-run'], ['rm -rf .claude/.cache'], ['rm -rf not-there'],
  ['Remove-Item -Recurse -Force .claude/.cache', 'PowerShell'], ['Remove-Item emptied -Recurse -Confirm:$false', 'PowerShell']]) {
  const h = guardIn(c, tool);
  check(`guard allows: ${c}`, h.status === 0 && h.out === '', h.out || h.err);
}
writeFileSync(join(gd, 'newmod/leak.js'), `const k = "${'AKIA'}${'ABCDEFGHIJKLMNOP'}";\n`);
check('guard blocks git add + commit of a new file with a secret', denied(guardIn('git add -A && git commit -m x')));
r = guardIn('git commit -m x');
check('guard lets a commit through when the secret is only in an untracked file it cannot include', r.out === '', r.out);
rmSync(join(gd, 'newmod/leak.js'));
setConfig(gd, { guardRules: [{ pattern: String.raw`\bterraform\s+apply\b`, why: 'applying infrastructure changes' }] });
r = guardIn('terraform apply -auto-approve');
check('guard applies a project rule from guardRules in sdd.json', denied(r) && r.json.hookSpecificOutput.permissionDecisionReason.includes('applying infrastructure changes'), r.out);
setConfig(gd, { guardRules: [{ pattern: '([', why: 'broken' }] });
r = doctor(gd);
check('doctor: FAIL on an invalid pattern in guardRules', r.status === 1 && /FAIL +.*guardRules/.test(r.stdout), r.stdout);
check('guard keeps its own rules with a broken guardRules entry', denied(guardIn('git reset --hard')));
writeFileSync(cfgFile(gd), '{ broken');
check('guard keeps its own rules with a broken sdd.json', denied(guardIn('git reset --hard')));

// --- C. spec-only, D. session-start ----------------------------------------------------------------------------
check('spec-only allows a spec path', hook(fresh, 'spec-only.mjs', { tool_input: { file_path: join(fresh, 'openspec/specs/auth/spec.md') } }).out === '');
check('spec-only blocks other paths', denied(hook(fresh, 'spec-only.mjs', { tool_input: { file_path: 'src/a.ts' } })));
const codexEdit = (...lines) => ({ cwd: join(fresh, 'openspec'), tool_name: 'apply_patch', tool_input: { command: patch(...lines) } });
check('protect blocks a Codex edit of the archive (path relative to the session folder)', denied(hook(fresh, 'protect.mjs',
  codexEdit('*** Update File: changes/archive/2026-01-01-x/proposal.md', '@@', '-a', '+b'), { env: { CLAUDE_PROJECT_DIR: '' } })));
check('protect blocks a Codex edit of a generated copy', denied(hook(fresh, 'protect.mjs', codexEdit('*** Add File: ../.agents/skills/sdd/x.md', '+x'))));
r = hook(fresh, 'protect.mjs', codexEdit('*** Add File: ../src/new.js', '+x', '*** Update File: specs/auth/spec.md', '@@'));
check('protect allows other Codex edits', r.status === 0 && r.out === '', r.out);
check('session-start asks for /onboard', hook(fresh, 'session-start.mjs', {}).out.includes('/onboard'));
mkdirSync(join(fresh, 'docs/product'), { recursive: true });
writeFileSync(join(fresh, 'docs/product/roadmap.md'), '# Roadmap\n\n## Changes\n- [x] add-project-skeleton — done\n- [ ] add-search — search booths\n');
check('session-start shows the next roadmap item', hook(fresh, 'session-start.mjs', {}).out.includes('Next on the roadmap: add-search'));

// --- E. stop gate ------------------------------------------------------------------------------------------------
const freshConfig = json(read(cfgFile(fresh)));
const setCommands = (o) => writeFileSync(cfgFile(fresh), JSON.stringify({ ...freshConfig, typecheck: '', tests: '', format: '', stopGate: 'typecheck', stopGateRetries: 1, ...o }));
setCommands({ typecheck: 'node -e "process.exit(1)"' });
mkdirSync(join(fresh, 'src/deep'), { recursive: true });
writeFileSync(join(fresh, 'src/a.js'), 'export const a = 1;\n');
const noProjectDir = { CLAUDE_PROJECT_DIR: '' };
r = hook(fresh, 'stop-gate.mjs', { session_id: 's1', stop_hook_active: false }, { cwd: join(fresh, 'src/deep'), env: noProjectDir });
check('stop gate blocks a red typecheck (Codex style: no CLAUDE_PROJECT_DIR, run from a subfolder)', blocked(r), r.out || r.err);
r = hook(fresh, 'stop-gate.mjs', { session_id: 's1', stop_hook_active: true });
check('stop gate: a second stop with no code change ends the turn with a warning', warned(r) && r.json.systemMessage.includes('still fails'), r.out);
writeFileSync(join(fresh, 'src/a.js'), 'export const a = 2;\n');
r = hook(fresh, 'stop-gate.mjs', { session_id: 's1', stop_hook_active: true });
check('stop gate re-checks after a change; retries used up → turn ends with a warning', warned(r) && r.json.systemMessage.includes('retry'), r.out);
r = hook(fresh, 'stop-gate.mjs', { session_id: 's4', stop_hook_active: false });
check('stop gate blocks again in a new stop sequence', blocked(r), r.out);
setCommands({ typecheck: 'node -e "process.exit(0)"' });
writeFileSync(join(fresh, 'src/a.js'), 'export const a = 3;\n');
r = hook(fresh, 'stop-gate.mjs', { session_id: 's4', stop_hook_active: true });
check('stop gate checks the fix in the same sequence and lets a green turn end', r.status === 0 && r.out === '', r.out);
r = hook(fresh, 'stop-gate.mjs', { session_id: 's2' });
check('stop gate passes a green typecheck', r.status === 0 && r.out === '', r.out);
const a = join(fresh, 'src/a.js'), mtime = statSync(a).mtime;
writeFileSync(a, 'export const a = 4;\n'); // same size
utimesSync(a, mtime, mtime);
setCommands({ typecheck: 'node -e "process.exit(1)"' });
r = hook(fresh, 'stop-gate.mjs', { session_id: 's5' });
check('stop gate sees a new file edited with the same size and mtime', blocked(r), r.out);
writeFileSync(a, 'export const a = 3;\n');
utimesSync(a, mtime, mtime);
setCommands({ typecheck: 'node -e "process.exit(1)"' });
appendFileSync(join(fresh, 'docs/product/roadmap.md'), '\n');
r = hook(fresh, 'stop-gate.mjs', { session_id: 's3' });
check('stop gate ignores docs-only changes (cached pass)', r.status === 0 && r.out === '', r.out);
const branchBefore = git(fresh, 'branch', '--show-current').stdout.trim();
git(fresh, 'switch', '-qc', 'spike/try-layout');
writeFileSync(a, 'export const a = 5;\n');
r = hook(fresh, 'stop-gate.mjs', { session_id: 's6' });
check('stop gate stays out of a spike branch', r.status === 0 && r.out === '', r.out);
git(fresh, 'switch', '-q', branchBefore);

// --- F. post-edit ------------------------------------------------------------------------------------------------
setCommands({ format: `node -e "require('fs').appendFileSync(process.argv[1], '//fmt')" {file}` });
r = hook(fresh, 'post-edit.mjs', { tool_input: { file_path: join(fresh, 'src/a.js') } });
check('post-edit runs the formatter on the edited file', r.status === 0 && read(join(fresh, 'src/a.js')).endsWith('//fmt'), r.out || r.err);
r = hook(fresh, 'post-edit.mjs', { cwd: join(fresh, 'src'), tool_name: 'apply_patch', tool_input: { command: patch('*** Update File: a.js', '@@', '*** Delete File: gone.js') } });
check('post-edit formats the files of a Codex patch, skipping deleted ones', r.status === 0 && read(join(fresh, 'src/a.js')).endsWith('//fmt//fmt'), r.out || r.err);
setCommands({ format: 'node -e "process.exit(3)" {file}' });
check('post-edit reports a failing formatter', blocked(hook(fresh, 'post-edit.mjs', { tool_input: { file_path: 'src/a.js' } })));
setCommands({ format: `node -e "require('fs').appendFileSync(process.argv[1], '//fmt')" {file}`, formatScope: 'new' });
writeFileSync(join(fresh, 'src/brand-new.js'), 'export const n = 1;\n');
hook(fresh, 'post-edit.mjs', { tool_input: { file_path: join(fresh, 'clean.js') } });
hook(fresh, 'post-edit.mjs', { tool_input: { file_path: join(fresh, 'src/brand-new.js') } });
check('post-edit with formatScope "new" leaves a committed file alone and formats a new one',
  !read(join(fresh, 'clean.js')).includes('//fmt') && read(join(fresh, 'src/brand-new.js')).endsWith('//fmt'), read(join(fresh, 'clean.js')));
rmSync(join(fresh, 'src/brand-new.js'));
git(fresh, 'checkout', '--', 'clean.js');

// --- G. Codex launch commands, run the way Codex runs them ------------------------------------------------------
const pre = codexHooks.hooks.PreToolUse[0].hooks[0];
const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' } });
const viaShell = (command, shell) => {
  const o = { cwd: join(fresh, 'src/deep'), input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } };
  const x = shell === 'powershell' ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], o)
    : spawnSync(command, { ...o, shell: shell || true });
  return { status: x.status, json: json(x.stdout), out: `${x.stdout}${x.stderr}` };
};
if (WIN) {
  r = viaShell(pre.commandWindows); check('Codex Windows command blocks via cmd.exe, from a subfolder', denied(r), r.out);
  // Soft check: whether PowerShell hands its stdin to a native child depends on the PowerShell version, so this
  // does not prove what Codex does. A WARN here means: test the hook in Codex itself before relying on it.
  r = viaShell(pre.commandWindows, 'powershell');
  console.log(`${denied(r) ? 'ok  ' : 'WARN'}  Codex Windows command blocks via PowerShell, from a subfolder${denied(r) ? '' : `\n      ${r.out.trim().split('\n')[0]}`}`);
} else {
  r = viaShell(pre.command, '/bin/sh'); check('Codex POSIX command blocks via sh, from a subfolder', denied(r), r.out);
  r = viaShell(pre.commandWindows, '/bin/sh'); check('Codex Windows command form also works under sh', denied(r), r.out);
}

// --- H. doctor ---------------------------------------------------------------------------------------------------
git(fresh, 'checkout', '--', '.claude/sdd.json');
r = doctor(fresh);
check('doctor: no FAIL on a fresh install', r.status === 0, r.stdout);
check('doctor warns that docs/architecture.md and docs/product/brief.md are still templates',
  /WARN +docs\/architecture\.md/.test(r.stdout) && /WARN +docs\/product\/brief\.md/.test(r.stdout), r.stdout);
writeFileSync(join(fresh, 'docs/architecture.md'), '# Architecture\n\n## Layers\nRoutes call services; services own the database.\n');
r = doctor(fresh);
check('doctor stops warning once docs/architecture.md is filled', !/WARN +docs\/architecture\.md/.test(r.stdout), r.stdout);
git(fresh, 'checkout', '--', 'docs/architecture.md');
setCommands({ formatScope: 'changed' });
r = doctor(fresh);
check('doctor: FAIL on an unknown formatScope', r.status === 1 && /FAIL +.*formatScope/.test(r.stdout), r.stdout);
const kitSettings = read(join(fresh, '.claude/settings.json'));
check('the kit runs a pinned ctx7, never its latest release', /ctx7@\d+\.\d+\.\d+ library/.test(kitSettings)
  && !/ctx7@latest/.test(kitSettings + read(join(fresh, '.claude/skills/context7/SKILL.md'))));
setCommands({ stopGate: 'off', lint: 'node -e "0"', build: 'node -e "0"' });
r = doctor(fresh, '--full');
check('doctor --full runs lint and build too', /OK +lint: .* passed/.test(r.stdout) && /OK +build: .* passed/.test(r.stdout), r.stdout);
setCommands({ stopGate: 'tests' });
r = doctor(fresh);
check('doctor: FAIL when the stop gate has no command', r.status === 1 && r.stdout.includes('FAIL'), r.stdout);
git(fresh, 'checkout', '--', '.claude/sdd.json');

// --- I. Existing project with old instructions -------------------------------------------------------------------
const old = join(root, 'existing');
mkdirSync(join(old, '.claude'), { recursive: true });
git(old, 'init', '-q');
writeFileSync(join(old, 'AGENTS.md'), '# Rules\n- Use pnpm\n');
writeFileSync(join(old, 'CLAUDE.md'), 'Read AGENTS.md\n');
writeFileSync(join(old, '.claude/settings.json'), JSON.stringify({ model: 'opus',
  permissions: { allow: ['Bash(pnpm test*)'], deny: ['Read(./secrets/**)'] },
  hooks: { PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: './scripts/fmt.sh' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.mjs'], timeout: 15 }] }] } }));
r = setup(old);
check('setup into an existing repo', r.status === 0, r.stderr);
check('old AGENTS.md and CLAUDE.md kept as *.old.md', read(join(old, 'AGENTS.old.md')).includes('Use pnpm') && existsSync(join(old, 'CLAUDE.old.md')));
const s = json(read(join(old, '.claude/settings.json')));
const hookCmds = Object.values(s.hooks).flat().flatMap((g) => g.hooks).map((h) => h.command);
check('settings merged: own model, permission and hook kept, kit hooks added',
  s.model === 'opus' && s.permissions.allow.includes('Bash(pnpm test*)') && s.permissions.allow.includes('Bash(git status*)')
  && hookCmds.includes('./scripts/fmt.sh') && hookCmds.filter((c) => c === 'node').length >= 4, JSON.stringify(s.hooks));
const guards = s.hooks.PreToolUse.filter((g) => g.hooks.some((h) => String(h.args).includes('guard.mjs')));
check('settings merged: guard moved from Bash to Bash|PowerShell, not doubled', guards.length === 1 && guards[0].matcher === 'Bash|PowerShell', JSON.stringify(s.hooks.PreToolUse));
check('settings merged: the kit adds its entries, your own entries stay',
  s.permissions.allow.some((x) => /ctx7@\d/.test(x))
  && s.permissions.deny.includes('Read(./secrets/**)') && s.permissions.deny.includes('Read(./.env)'), JSON.stringify(s.permissions));
check('second run changes nothing', setup(old).stdout.includes('nothing to do'));

// --- J. --from, K. CRLF, L. --update -----------------------------------------------------------------------------
mkdirSync(join(root, 'img'));
writeFileSync(join(root, 'img/flow.png'), Buffer.from([137, 80, 78, 71]));
const doc = join(root, 'idea.md');
writeFileSync(doc, '# My product\n\n![flow](img/flow.png)\n\n## Search\nUsers find booths by name. See [notes](../outside.md).\n');
const withDoc = join(root, 'with-doc');
r = setup(withDoc, '--from', doc);
check('--from copies the document unchanged', read(join(withDoc, 'docs/product/sources/idea.md')) === read(doc));
check('--from copies files the document links, warns about links outside its folder',
  existsSync(join(withDoc, 'docs/product/sources/img/flow.png')) && /warn +\.\.\/outside\.md/.test(r.stdout), r.stdout);
check('--from prints /onboard with the document', r.stdout.includes('/onboard docs/product/sources/idea.md'), r.stdout);
const lib = join(withDoc, '.claude/hooks/lib.mjs');
writeFileSync(lib, read(lib).replace(/\n/g, '\r\n'));
check('a CRLF checkout of a kit file is not reported as changed', setup(withDoc).stdout.includes('nothing to do'));
// An older kit version: the lock holds the hash of what that version wrote.
const lockPath = join(withDoc, '.claude/sdd.lock.json');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const writeLock = (files) => { const l = lockOf(withDoc); writeFileSync(lockPath, JSON.stringify({ ...l, files: { ...l.files, ...files } }, null, 2)); };
const kitFile = (rel) => read(join(KIT, 'template', rel));
writeFileSync(join(withDoc, '.claude/skills/sdd/flow.md'), 'flow of an older kit\n');
writeFileSync(join(withDoc, '.claude/agents/implementer.md'), 'implementer of an older kit\n');
writeFileSync(join(withDoc, '.claude/skills/sdd/old-notes.md'), 'a file an older kit shipped\n');
writeFileSync(join(withDoc, '.claude/skills/sdd/old-edited.md'), 'another one, edited here\n');
writeLock({ '.claude/skills/sdd/flow.md': sha('flow of an older kit\n'), '.claude/agents/implementer.md': sha('implementer of an older kit\n'),
  '.claude/skills/sdd/old-notes.md': sha('a file an older kit shipped\n'), '.claude/skills/sdd/old-edited.md': sha('as the kit wrote it\n') });
appendFileSync(join(withDoc, '.claude/hooks/guard.mjs'), '\n// local edit\n');
writeFileSync(join(withDoc, 'docs/architecture.md'), '# Architecture\n\nFilled by onboard.\n');
writeFileSync(join(withDoc, 'AGENTS.md'), read(join(withDoc, 'AGENTS.md')).replace('<project name>', 'with-doc'));
rmSync(join(withDoc, 'docs/product/brief.md'));
setConfig(withDoc, { tests: 'npm test', guardRules: [{ pattern: 'kubectl delete', why: 'deleting cluster resources' }] });
const configBefore = json(read(cfgFile(withDoc)));
r = setup(withDoc);
check('a plain run reports outdated kit files and replaces nothing', r.stdout.includes('old     .claude/skills/sdd/flow.md')
  && read(join(withDoc, '.claude/skills/sdd/flow.md')) === 'flow of an older kit\n' && !r.stdout.includes('local edit'), r.stdout);
r = setup(withDoc, '--update');
check('--update replaces kit files unchanged since the kit wrote them, with a backup', read(join(withDoc, '.claude/skills/sdd/flow.md')) === kitFile('.claude/skills/sdd/flow.md')
  && read(join(withDoc, '.claude/agents/implementer.md')) === kitFile('.claude/agents/implementer.md') && r.stdout.includes('kit-backup'), r.stdout);
check('--update of an onboarded project does not ask for /onboard', !r.stdout.includes('run /onboard'), r.stdout);
check('--update keeps a kit file changed here and leaves the new version next to it', read(join(withDoc, '.claude/hooks/guard.mjs')).includes('local edit')
  && /keep +\.claude\/hooks\/guard\.mjs \(changed here/.test(r.stdout) && read(join(withDoc, '.claude/.cache/kit-new/.claude/hooks/guard.mjs')) === kitFile('.claude/hooks/guard.mjs'), r.stdout);
check('--update keeps a filled template and a deleted one stays deleted', read(join(withDoc, 'docs/architecture.md')).includes('Filled by onboard')
  && !existsSync(join(withDoc, 'docs/product/brief.md')), r.stdout);
check('--update deletes a file the kit no longer ships, keeps one changed here', !existsSync(join(withDoc, '.claude/skills/sdd/old-notes.md'))
  && existsSync(join(withDoc, '.claude/skills/sdd/old-edited.md')) && /keep +\.claude\/skills\/sdd\/old-edited\.md \(changed here and no longer/.test(r.stdout), r.stdout);
check('--update keeps every value in sdd.json', JSON.stringify(json(read(cfgFile(withDoc)))) === JSON.stringify(configBefore));
check('--update keeps the old hash of a file changed here, so the next --update keeps it too',
  lockOf(withDoc).files['.claude/hooks/guard.mjs'] === plainLock.files['.claude/hooks/guard.mjs'] && !('.claude/skills/sdd/old-edited.md' in lockOf(withDoc).files));
r = setup(withDoc, '--update', '--force');
check('--update --force replaces a kit file changed here (with a backup), never a filled template', !read(join(withDoc, '.claude/hooks/guard.mjs')).includes('local edit')
  && read(join(withDoc, 'docs/architecture.md')).includes('Filled by onboard') && existsSync(join(withDoc, 'docs/product/brief.md')), r.stdout);

// --- N. sync: ownership, path rules, CRLF ---------------------------------------------------------
const cx = join(root, 'codex');
mkdirSync(join(cx, '.agents/skills/sdd'), { recursive: true });
writeFileSync(join(cx, '.agents/skills/sdd/SKILL.md'), 'my own sdd\n');
r = setup(cx, '--codex');
check('sync keeps a skill it did not write', read(join(cx, '.agents/skills/sdd/SKILL.md')) === 'my own sdd\n' && /skip +\.agents\/skills\/sdd\/SKILL\.md/.test(r.stdout), r.stdout);
const sync = (...a) => node([join(cx, SCRIPTS.sync), ...a]);
r = sync('--check');
check('sync --check reports the conflict without failing', r.status === 0 && r.stdout.includes('conflict  .agents/skills/sdd/SKILL.md'), r.stdout);
r = doctor(cx);
check('doctor warns about the conflict', /WARN +\.agents\/skills\/sdd\/SKILL\.md exists and was not generated/.test(r.stdout), r.stdout);
appendFileSync(join(cx, '.agents/skills/handoff/SKILL.md'), 'hand edit\n');
writeFileSync(join(cx, '.agents/skills/intake/NOTES.md'), 'mine\n');
rmSync(join(cx, '.claude/skills/context7'), { recursive: true });
r = sync();
const backups = (rel) => { const b = join(cx, '.claude/.cache/kit-backup'); return existsSync(b) && readdirSync(b).some((t) => existsSync(join(b, t, rel))); };
check('sync backs up a hand-edited copy before replacing it', !read(join(cx, '.agents/skills/handoff/SKILL.md')).includes('hand edit') && backups('.agents/skills/handoff/SKILL.md'), r.stdout);
check('sync deletes copies of a removed skill, keeps files it did not write', !existsSync(join(cx, '.agents/skills/context7'))
  && read(join(cx, '.agents/skills/intake/NOTES.md')) === 'mine\n', r.stdout);
r = sync('--force');
check('sync --force replaces a foreign file and keeps a backup', read(join(cx, '.agents/skills/sdd/SKILL.md')).includes('Generated from') && backups('.agents/skills/sdd/SKILL.md'), r.stdout);
mkdirSync(join(cx, '.claude/rules'), { recursive: true });
writeFileSync(join(cx, '.claude/rules/ui.md'), '---\npaths:\n  - "src/ui/**"\n---\n- Strings inline.\n');
check('sync --check notices a new path rule', sync('--check').status === 1);
sync();
check('AGENTS.md path-rules block lists the rule', read(join(cx, 'AGENTS.md')).includes('- `src/ui/**` → `.claude/rules/ui.md`') && sync('--check').status === 0);
// prettier puts a blank line between an HTML comment, a paragraph and a list; a block without them would flip back
// and forth between a formatted AGENTS.md and the next sync.
check('AGENTS.md path-rules block is laid out as prettier prints it',
  /<!-- spec-first-kit:path-rules -->\n\nCodex: [^\n]+\nBefore editing [^\n]+\n\n- `src\/ui\/\*\*` [^\n]+\n\n<!-- \/spec-first-kit:path-rules -->\n/.test(read(join(cx, 'AGENTS.md'))), read(join(cx, 'AGENTS.md')));
const cxLock = join(cx, '.claude/sdd.lock.json');
// git with core.autocrlf=true (the Git for Windows default) checks every text file out with CRLF line endings.
const toCrlf = (dir) => {
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true }).filter((x) => x.isFile())) {
    const p = join(e.parentPath ?? e.path, e.name), b = readFileSync(p);
    if (!b.includes(0)) writeFileSync(p, b.toString('utf8').replace(/\r?\n/g, '\r\n'));
  }
};
for (const d of ['.agents', '.codex', '.claude/skills', '.claude/agents', '.claude/rules']) toCrlf(join(cx, d));
writeFileSync(join(cx, 'AGENTS.md'), read(join(cx, 'AGENTS.md')).replace(/\r?\n/g, '\r\n'));
r = sync('--check');
check('sync --check: a CRLF checkout of current copies is not stale', r.status === 0, r.stdout);
r = doctor(cx);
check('doctor: a CRLF checkout of current copies is no FAIL', r.status === 0 && !r.stdout.includes('stale'), r.stdout);
const lockBefore = readFileSync(cxLock);
r = sync();
check('sync on a CRLF checkout of current copies writes nothing, not even the lock',
  r.stdout.includes('0 written') && readFileSync(cxLock).equals(lockBefore), r.stdout);
r = setup(cx, '--no-codex');
check('--no-codex removes the Codex copies (not files it did not write), the protect hook, its deny entries and the AGENTS.md block content',
  !existsSync(join(cx, '.agents/skills/sdd')) && existsSync(join(cx, '.agents/skills/intake/NOTES.md'))
  && !existsSync(join(cx, '.codex')) && !existsSync(join(cx, '.claude/hooks/protect.mjs'))
  && !read(join(cx, '.claude/settings.json')).includes('.codex') && json(read(cfgFile(cx))).codex === false
  && !read(join(cx, 'AGENTS.md')).includes('src/ui/**') && Object.keys(lockOf(cx).generated).length === 0 && doctor(cx).status === 0,
  r.stdout.split('\n').slice(-3).join('\n') + doctor(cx).stdout);
r = setup(cx, '--codex');
check('--codex later brings it all back', existsSync(join(cx, '.codex/hooks.json')) && existsSync(join(cx, '.claude/hooks/protect.mjs'))
  && read(join(cx, 'AGENTS.md')).includes('- `src/ui/**` → `.claude/rules/ui.md`') && sync('--check').status === 0, r.stdout);

// --- O. snapshot: review without commits --------------------------------------------------------------------------
const sn = join(root, 'snap');
setup(sn);
git(sn, 'init', '-q', '-b', 'main');
const snap = (...a) => node([join(sn, SCRIPTS.snapshot), ...a], { cwd: a.includes('--cwd-src') ? join(sn, 'src') : sn });
const emptyTreeId = spawnSync('git', ['hash-object', '-t', 'tree', '--stdin'], { cwd: sn, input: '', encoding: 'utf8' }).stdout.trim();
check('snapshot --base with no commit yet is the empty tree', snap('--base').stdout.trim() === emptyTreeId, snap('--base').stderr);
writeFileSync(join(sn, '.gitignore'), 'node_modules/\n.claude/.cache/\n');
mkdirSync(join(sn, 'src'), { recursive: true });
writeFileSync(join(sn, 'src/a.js'), 'a\n');
git(sn, 'add', '-A');
git(sn, '-c', 'user.email=s@e', '-c', 'user.name=s', 'commit', '-qm', 'base');
git(sn, 'switch', '-qc', 'add-x');
appendFileSync(join(sn, 'src/a.js'), 'staged\n');
git(sn, 'add', 'src/a.js');
appendFileSync(join(sn, 'src/a.js'), 'unstaged\n');
writeFileSync(join(sn, 'src/new.js'), 'new\n');
mkdirSync(join(sn, 'node_modules/x'), { recursive: true });
writeFileSync(join(sn, 'node_modules/x/i.js'), 'ignored\n');
const indexBefore = readFileSync(join(sn, '.git/index'));
const statusBefore = git(sn, 'status', '--porcelain').stdout;
const base = snap('--base').stdout.trim();
const t1 = node([join(sn, SCRIPTS.snapshot)], { cwd: join(sn, 'src') }).stdout.trim();
const files = git(sn, 'diff', '--name-only', base, t1).stdout.trim().split('\n');
check('snapshot holds staged, unstaged and untracked changes, not ignored files (run from a subfolder)',
  /^[0-9a-f]{40,64}$/.test(t1) && files.includes('src/a.js') && files.includes('src/new.js') && !files.some((f) => f.startsWith('node_modules'))
  && git(sn, 'show', `${t1}:src/a.js`).stdout.includes('unstaged'), files.join(' '));
check('snapshot leaves the index, the status and no temp file behind', readFileSync(join(sn, '.git/index')).equals(indexBefore)
  && git(sn, 'status', '--porcelain').stdout === statusBefore && !readdirSync(join(sn, '.git')).some((f) => f.startsWith('kit-snapshot')));
check('snapshot --base on a branch is its merge-base with main', base === git(sn, 'merge-base', 'HEAD', 'main').stdout.trim());
appendFileSync(join(sn, 'src/new.js'), 'fix\n');
const t2 = node([join(sn, SCRIPTS.snapshot)], { cwd: sn }).stdout.trim();
check('two snapshots diff to just the fix (re-review)', git(sn, 'diff', '--name-only', t1, t2).stdout.trim() === 'src/new.js');
const wt = join(root, 'snap-wt');
git(sn, 'worktree', 'add', '-q', wt, 'main');
writeFileSync(join(wt, 'w.js'), 'w\n');
r = node([join(sn, SCRIPTS.snapshot)], { cwd: wt });
check('snapshot works inside a git worktree', r.status === 0 && git(sn, 'show', `${r.stdout.trim()}:w.js`).stdout === 'w\n', r.stderr);

// --- P. trace: scenarios to tests ---------------------------------------------------------------------------------
const tr = join(root, 'trace');
setup(tr);
git(tr, 'init', '-q');
const spec = (cap, text) => { mkdirSync(join(tr, 'openspec/changes/c1/specs', cap), { recursive: true }); writeFileSync(join(tr, 'openspec/changes/c1/specs', cap, 'spec.md'), text); };
spec('search', ['## MODIFIED Requirements', '', '### Requirement: Search by name', '<!-- code: src/s.ts#find · test: tests/old.py -->',
  'The system SHALL list matches.', '', '#### Scenario: Partial name', '- **WHEN** x', '- **THEN** y', '', '#### Scenario: Different case', '- **WHEN** x', '- **THEN** y',
  '', '## ADDED Requirements', '', '### Requirement: Поиск по городу', 'The system SHALL filter by city.', '', '#### Scenario: Город выбран', '- **WHEN** x', '- **THEN** y',
  '', '#### Scenario: Clear button pressed', '<!-- manual: focus ring, checked with run-app -->', '- **WHEN** x', '- **THEN** y',
  '', '#### Scenario: Empty', '- **WHEN** x', '- **THEN** y', '', '#### Scenario: Never tested here', '- **WHEN** x', '- **THEN** y',
  '', '## REMOVED Requirements', '', '### Requirement: Old', '#### Scenario: Old scenario', '- **WHEN** x', '- **THEN** y', ''].join('\n'));
mkdirSync(join(tr, 'tests'), { recursive: true });
mkdirSync(join(tr, 'src'), { recursive: true });
writeFileSync(join(tr, 'tests/old.py'), 'def test_x(): pass\n');
writeFileSync(join(tr, 'src/search_test.go'), 'func TestDifferentCase(t *testing.T) {}\n');
writeFileSync(join(tr, 'src/city.spec.ts'), '// Scenario: Город выбран\nit("filters by city", () => {});\ntest("empty", () => {});\n');
writeFileSync(join(tr, 'docs.md'), 'Never tested here\n');
const trace = () => node([join(tr, SCRIPTS.trace), 'c1']);
r = trace();
const status = (title) => r.stdout.split('\n').find((l) => l.includes(`/ ${title} →`))?.split(/\s+/)[0];
check('trace: anchored, named (camelCase, comment in another language), manual, short, missing; REMOVED skipped',
  status('Partial name') === 'anchored' && status('Different case') === 'named' && status('Город выбран') === 'named'
  && status('Clear button pressed') === 'manual' && status('Empty') === 'short' && status('Never tested here') === 'missing'
  && !r.stdout.includes('Old scenario') && r.status === 1, r.stdout);
writeFileSync(join(tr, 'tests/never.test.js'), 'it("never_tested_here")\n');
r = trace();
check('trace: an anchored scenario fails until a test names it', r.status === 1 && status('Partial name') === 'anchored'
  && !r.stdout.split('\n').some((l) => l.startsWith('missing')), r.stdout);
writeFileSync(join(tr, 'tests/old.py'), '# Scenario: Partial name\ndef test_x(): pass\n');
r = trace();
check('trace exits 0 once every scenario is accounted for (a new untracked test counts)', r.status === 0, r.stdout);
setConfig(tr, { testFiles: '^checks/' });
check('trace: testFiles overrides how tests are found', trace().status === 1);
setConfig(tr, { testFiles: '([' });
check('trace: an invalid testFiles stops with exit 2', trace().status === 2);
check('the kit allows its scripts without a prompt', Object.values(SCRIPTS).every((s) => json(read(join(tr, '.claude/settings.json'))).permissions.allow.includes(`Bash(node ${s}*)`)));

// --- Q. reviewer: what its diffs leave out -------------------------------------------------------------------------
const rv = join(root, 'review');
mkdirSync(rv, { recursive: true });
git(rv, 'init', '-q');
for (const f of ['package-lock.json', 'web/pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'bun.lockb', 'src/__snapshots__/a.test.ts.snap',
  'generated/api.ts', 'src/generated/db.ts', 'dist/app.js', '.agents/skills/x.md', '.codex/hooks.json',
  'src/clock.ts', 'src/auth/lockout.ts', 'src/blockService.ts', 'src/app.ts']) {
  mkdirSync(dirname(join(rv, f)), { recursive: true });
  writeFileSync(join(rv, f), 'x\n');
}
git(rv, 'add', '-A');
const excludes = [...read(join(KIT, 'template/.claude/agents/reviewer.md')).match(/`-- \. ([^`]+)`/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const reviewed = git(rv, 'ls-files', '--', '.', ...excludes).stdout.trim().split('\n').sort().join(' ');
check('reviewer diffs leave out lock files, snapshots, generated code and Codex copies, not clock.ts or lockout.ts',
  reviewed === 'src/app.ts src/auth/lockout.ts src/blockService.ts src/clock.ts', reviewed);

// --- R. monorepo: one kit at the root, sessions started in a package ------------------------------------------------
const mono = join(root, 'mono');
const api = join(mono, 'packages/api');
mkdirSync(join(api, 'src'), { recursive: true });
mkdirSync(join(mono, 'packages/web/.claude'), { recursive: true });
writeFileSync(join(mono, 'packages/web/.claude/settings.json'), '{ "permissions": { "allow": ["Bash(pnpm dev)"] } }\n');
git(mono, 'init', '-q', '-b', 'main');
r = setup(api, '--dry-run');
check('setup warns when the target is a subfolder of a git repository', r.stdout.includes('repository root'), r.stdout);
setup(mono);
writeFileSync(join(api, 'src/a.js'), 'export const a = 1;\n');
git(mono, 'add', '-A');
git(mono, '-c', 'user.email=s@e', '-c', 'user.name=s', 'commit', '-qm', 'init');
const setMono = (o) => setConfig(mono, o);
setMono({ packages: ['packages/*'], typecheck: 'node -e "process.exit(1)"', stopGate: 'typecheck' });
check('session-start notices package stubs that are not generated yet', hook(mono, 'session-start.mjs', {}).out.includes('Generated harness files are stale'));
const monoSync = (...a) => node([join(mono, SCRIPTS.sync), ...a]);
r = monoSync();
const apiStub = join(api, '.claude/settings.json');
const stub = existsSync(apiStub) ? json(read(apiStub)) : null;
check('sync gives each listed package a settings stub that runs the root hooks, and no Codex copies without codex',
  stub?.hooks?.PreToolUse?.[0]?.hooks?.[0]?.args?.[0] === '${CLAUDE_PROJECT_DIR}/../../.claude/hooks/guard.mjs'
  && stub.permissions?.deny?.includes('Read(./.env)') && !existsSync(join(mono, '.agents')) && !existsSync(join(mono, '.codex')), r.stdout);
check('sync leaves a package settings file it did not write', read(join(mono, 'packages/web/.claude/settings.json')).includes('pnpm dev')
  && /skip +packages\/web\/\.claude\/settings\.json/.test(r.stdout), r.stdout);
// Run a stub hook the way Claude Code does when it starts in the package: CLAUDE_PROJECT_DIR is the package.
const runStub = (event, input) => {
  const h = stub?.hooks?.[event]?.[0]?.hooks?.[0];
  if (!h) return { status: -1, out: '', json: null };
  const x = spawnSync(h.command, h.args.map((v) => v.replace('${CLAUDE_PROJECT_DIR}', api)),
    { cwd: api, input: JSON.stringify({ cwd: api, ...input }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: api } });
  return { status: x.status, out: x.stdout.trim(), json: json(x.stdout) };
};
check('a session started in a package: the stub runs guard', denied(runStub('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'git reset --hard' } })));
writeFileSync(join(api, 'src/a.js'), 'export const a = 2;\n');
r = runStub('Stop', { session_id: 'm1' });
check('a session started in a package: the stop gate reads the root sdd.json and sees the change', blocked(r), r.out);
const miner = read(join(mono, '.claude/agents/spec-miner.md'));
const minerCmd = miner.match(/^\s+command: (\S+)/m)[1], minerArgs = JSON.parse(miner.match(/^\s+args: (\[.*\])$/m)[1]);
const viaMiner = (file) => spawnSync(minerCmd, minerArgs, { cwd: api, input: JSON.stringify({ tool_input: { file_path: file } }), encoding: 'utf8',
  env: { ...process.env, CLAUDE_PROJECT_DIR: api } }).stdout.trim();
check('the spec-miner hook works from a package: it allows a spec and blocks code',
  viaMiner(join(mono, 'openspec/specs/api-orders/spec.md')) === '' && viaMiner(join(api, 'src/a.js')).includes('"deny"'),
  `${viaMiner(join(mono, 'openspec/specs/api-orders/spec.md'))} / ${viaMiner(join(api, 'src/a.js'))}`);
writeFileSync(join(api, 'AGENTS.md'), '# API\n\n- Handlers log the request id.\n');
r = doctor(mono);
check('doctor warns about a nested AGENTS.md that Claude Code does not read by itself', /WARN +packages\/api\/AGENTS\.md/.test(r.stdout), r.stdout);
check('doctor names the package settings it could not generate', /WARN +packages\/web\/\.claude\/settings\.json .*root hooks/.test(r.stdout), r.stdout);
writeFileSync(join(api, 'CLAUDE.md'), '@AGENTS.md\n');
r = doctor(mono);
check('doctor is quiet once a CLAUDE.md next to it imports it', !/WARN +packages\/api\/AGENTS\.md/.test(r.stdout), r.stdout);
setMono({ packages: 'packages/*' });
r = doctor(mono);
check('doctor: FAIL when packages is not a list', r.status === 1 && /FAIL +.*packages must be a list/.test(r.stdout), r.stdout);
setMono({ packages: ['libs/*'] });
r = doctor(mono);
check('doctor warns about a packages entry that matches no folder', /WARN +.*libs\/\*/.test(r.stdout), r.stdout);
setMono({ packages: [] });
monoSync();
check('sync removes the stub of a package taken off the list', !existsSync(apiStub));

// --- T. one project, two spellings of its path ----------------------------------------------------------------------
// macOS temp folders sit behind a symlink (/var → /private/var) and Windows runners use 8.3 names (RUNNER~1): the
// module path of a script and the paths a client or git hands it then differ in spelling, not in place.
const linked = join(root, 'linked');
symlinkSync(fresh, linked, 'junction'); // a junction needs no admin rights on Windows; the type is ignored elsewhere
r = node([join(linked, SCRIPTS.sync), '--check']);
check('sync run through a link still runs as a script', r.status === 0 && r.stdout.includes('Generated files are current'), r.stdout + r.stderr);
const viaLink = (script, input) => node([join(linked, '.claude/hooks', script)], { input: JSON.stringify(input), cwd: linked }).stdout.trim();
check('spec-only run through a link allows a spec given by its real path, blocks code',
  viaLink('spec-only.mjs', { tool_input: { file_path: join(fresh, 'openspec/specs/auth/spec.md') } }) === ''
  && viaLink('spec-only.mjs', { tool_input: { file_path: join(fresh, 'src/a.js') } }).includes('"deny"'));
check('protect run through a link blocks the archive given by its real path',
  viaLink('protect.mjs', { tool_name: 'apply_patch', tool_input: { command: patch(`*** Update File: ${join(fresh, 'openspec/changes/archive/x.md')}`, '@@') } }).includes('"deny"'));
r = setup(linked, '--dry-run');
check('setup through a link to a repository root does not call it a subfolder', !r.stdout.includes('repository root'), r.stdout);

// --- M. OpenSpec cycle -------------------------------------------------------------------------------------------
if (hasOpenspec) {
  const os = (...a) => spawnSync(`openspec ${a.join(' ')}`, { cwd: fresh, shell: true, encoding: 'utf8' });
  r = os('new', 'change', 'add-search');
  check('openspec new change', r.status === 0, r.stdout + r.stderr);
  const ch = join(fresh, 'openspec/changes/add-search');
  mkdirSync(join(ch, 'specs/search'), { recursive: true });
  writeFileSync(join(ch, 'proposal.md'), '# add-search\n\nTier: M\n\n## Why\nVisitors cannot find booths.\n\n## What Changes\n- Search by name\n- Out of scope: filters\n\n## Capabilities\n- New: `search` — find booths\n');
  writeFileSync(join(ch, 'specs/search/spec.md'), '## Purpose\nLets a visitor find a booth by typing part of its exhibitor name.\n\n## ADDED Requirements\n\n### Requirement: Search by name\n<!-- source: docs/product/sources/idea.md#search -->\nThe system SHALL list booths whose exhibitor name contains the query.\n\n#### Scenario: Partial name\n- **WHEN** the visitor types "acm"\n- **THEN** the booth of "Acme Inc" is listed\n');
  writeFileSync(join(ch, 'tasks.md'), '## 1. Search\n- [x] 1.1 Add search (Req: Search by name) — verify: tests/search.test.js\n');
  r = os('validate', 'add-search', '--strict');
  check('openspec validate --strict with the kit config', r.status === 0, r.stdout + r.stderr);
  r = os('archive', 'add-search', '--yes');
  check('openspec archive keeps the source comment', r.status === 0 && read(join(fresh, 'openspec/specs/search/spec.md')).includes('<!-- source: docs/product/sources/idea.md#search -->'), r.stdout + r.stderr);
} else console.log('skip  OpenSpec checks: openspec CLI not installed');

if (!process.argv.includes('--keep')) rmSync(root, { recursive: true, force: true });
else console.log(`kept: ${root}`);
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
