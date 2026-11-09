#!/usr/bin/env node
// spec-first-kit. Harness health check: a computational sensor for the harness itself (sizes, placeholders, hooks,
// generated files, OpenSpec, stale work). Run it after /onboard, after editing .claude/, and once a week.
// Usage: node .claude/skills/onboard/scripts/doctor.mjs [--full] [--dir <repo>]
//   --full  also runs `openspec validate --all --strict` and the typecheck, lint, tests and build commands from
//           .claude/sdd.json, each once and timed: the onboarding baseline
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter, value } from './frontmatter.mjs';
import { createHash } from 'node:crypto';
import { stale, conflicts, packageEntries } from './sync.mjs';

const args = process.argv.slice(2);
const i = args.indexOf('--dir');
const dir = i >= 0 ? args[i + 1] : join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const full = args.includes('--full');

const results = [];
const ok = (m) => results.push(['OK  ', m]);
const warn = (m) => results.push(['WARN', m]);
const fail = (m) => results.push(['FAIL', m]);
const info = (m) => results.push(['INFO', m]);
const p = (...s) => join(dir, ...s);
const read = (f) => readFileSync(f, 'utf8');
const lines = (t) => t.split(/\r?\n/).length;
const sh = (cmd, timeout = 600_000) => {
  const t = Date.now();
  const r = spawnSync(cmd, { cwd: dir, shell: true, encoding: 'utf8', timeout });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`, s: ((Date.now() - t) / 1000).toFixed(1) };
};
const md = (root) => (existsSync(root) ? readdirSync(root, { recursive: true }).map((f) => String(f).replace(/\\/g, '/')).filter((f) => f.endsWith('.md')) : []);

// 0. Kit: version, kit files changed here, project settings
const lf = (b) => (b.includes(0) ? b : Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
let lock = null;
try { lock = JSON.parse(read(p('.claude', 'sdd.lock.json'))); } catch { warn('.claude/sdd.lock.json is missing, so setup.mjs cannot tell the kit files from yours: run setup.mjs --update'); }
if (lock) {
  const changed = Object.entries(lock.files || {}).filter(([f, h]) => existsSync(p(f))
    && createHash('sha256').update(lf(readFileSync(p(f)))).digest('hex') !== h).map(([f]) => f);
  info(`${lock.kit} ${lock.version}${changed.length ? `; changed here, so --update keeps them: ${changed.slice(0, 4).join(', ')}${changed.length > 4 ? `, and ${changed.length - 4} more` : ''}` : ''}`);
}
let cfg = {};
try { cfg = JSON.parse(read(p('.claude', 'sdd.json'))); } catch { fail('.claude/sdd.json is missing or not JSON'); }
if (cfg.codex !== undefined && typeof cfg.codex !== 'boolean') fail('sdd.json: codex must be true or false');
const codex = cfg.codex === true;

// 1. Instructions
if (!existsSync(p('AGENTS.md'))) fail('AGENTS.md is missing');
else {
  const t = read(p('AGENTS.md'));
  const n = lines(t), bytes = Buffer.byteLength(t);
  (n > 200 ? fail : n > 120 ? warn : ok)(`AGENTS.md: ${n} lines, ${(bytes / 1024).toFixed(1)} KiB (target ≤ 120 lines; Codex truncates the whole chain at 32 KiB)`);
  const holes = t.match(/<(project name|One sentence[^>]*|Only non-obvious[^>]*|src\/…|dist\/…|…|language|what lives here[^>]*)>/g) || [];
  if (holes.length) warn(`AGENTS.md has ${holes.length} placeholder(s) left: run /onboard`);
}
if (!existsSync(p('CLAUDE.md'))) info('no CLAUDE.md: Claude Code ≥ 2.1.277 reads AGENTS.md itself; older versions need CLAUDE.md with @AGENTS.md');
else if (!read(p('CLAUDE.md')).includes('@AGENTS.md')) warn('CLAUDE.md does not import @AGENTS.md: Claude Code will not see AGENTS.md');
// Claude Code loads a nested CLAUDE.md when it reads files in that folder, but not a nested AGENTS.md.
const nested = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ':(glob)**/AGENTS.md'], { cwd: dir, encoding: 'utf8' });
for (const f of (nested.status === 0 ? nested.stdout : '').split('\0').filter((x) => x && x.includes('/') && !/^\.(agents|codex)\//.test(x))) {
  const claude = join(dirname(p(f)), 'CLAUDE.md');
  if (!existsSync(claude) || !read(claude).includes('@AGENTS.md')) {
    warn(`${f}: Claude Code does not read a nested AGENTS.md by itself; put a CLAUDE.md next to it with the line @AGENTS.md`);
  }
}
// A template line is a placeholder in angle brackets: "<Which layer …>", "- <observable outcome>", "| <name> |".
for (const doc of ['docs/architecture.md', 'docs/product/brief.md']) {
  if (existsSync(p(doc)) && /^\s*(?:[-|]\s*)?<[A-Z][^>\n]*>/m.test(read(p(doc)))) {
    warn(`${doc} is still the kit template, and the AGENTS.md Map tells agents to read it: fill it from the repo, or delete it and its Map row`);
  }
}
for (const old of ['AGENTS.old.md', 'CLAUDE.old.md', '.cursorrules', '.github/copilot-instructions.md', '.cursor/rules']) {
  if (existsSync(p(old))) warn(`${old} still exists: merge what is true into AGENTS.md, then delete it (/onboard step 2)`);
}

// 2. Rules
for (const f of md(p('.claude', 'rules'))) {
  const t = read(p('.claude', 'rules', f));
  if (!/^---[\s\S]*?\npaths:/m.test(t)) warn(`.claude/rules/${f} has no paths: frontmatter, so it loads in every session`);
  if (lines(t) > 40) warn(`.claude/rules/${f}: ${lines(t)} lines (keep path rules short, ≤ ~15 bullet lines)`);
}

// 3. Skills
const skillsRoot = p('.claude', 'skills');
for (const name of existsSync(skillsRoot) ? readdirSync(skillsRoot) : []) {
  const f = join(skillsRoot, name, 'SKILL.md');
  if (!existsSync(f)) { if (statSync(join(skillsRoot, name)).isDirectory()) warn(`.claude/skills/${name}/ has no SKILL.md`); continue; }
  const t = read(f), fm = splitFrontmatter(t);
  const desc = `${value(fm, 'description') || ''}${value(fm, 'when_to_use') || ''}`;
  if (!desc) fail(`skill ${name}: no description, so no agent will know when to use it`);
  else if (desc.length > 1536) fail(`skill ${name}: description ${desc.length} chars, Claude Code truncates at 1536`);
  else if (desc.length > 600) warn(`skill ${name}: description ${desc.length} chars; every skill description is in every session`);
  if ((value(fm, 'name') || name) !== name) warn(`skill ${name}: frontmatter name differs from the folder name`);
  if (lines(t) > 500) warn(`skill ${name}: SKILL.md ${lines(t)} lines (≤ 500; move detail into files it links)`);
  for (const [, link] of t.matchAll(/\]\(([^)#:]+\.md)\)/g)) {
    if (!existsSync(join(skillsRoot, name, link))) warn(`skill ${name}: links ${link}, which does not exist`);
  }
}

// 4. Agents
const sessionModel = [];
for (const f of existsSync(p('.claude', 'agents')) ? readdirSync(p('.claude', 'agents')).filter((n) => n.endsWith('.md')) : []) {
  const fm = splitFrontmatter(read(p('.claude', 'agents', f)));
  if (!value(fm, 'name') || !value(fm, 'description')) fail(`agent ${f}: name and description are required`);
  if (!value(fm, 'tools')) warn(`agent ${f}: no tools list, so it inherits every tool`);
  if (read(p('.claude', 'agents', f)).includes('<!-- onboard:')) warn(`agent ${f}: project constraints not filled yet (/onboard)`);
  if (codex && !value(fm, 'codexModel')) sessionModel.push(String(value(fm, 'name') || f));
}
if (sessionModel.length) info(`in Codex, ${sessionModel.join(', ')} use the session model (codexModel: in the agent file pins one)`);

// 5. Hooks and project settings
const mode = cfg.stopGate || 'off';
if (!['off', 'typecheck', 'tests'].includes(mode)) fail(`sdd.json: stopGate "${mode}" must be off, typecheck or tests`);
else if (mode === 'off') warn('stop gate is off: the agent can end a turn with red checks (set it in /onboard)');
else if (!cfg.typecheck && !cfg.tests) fail(`stop gate is "${mode}" but sdd.json has no commands`);
else if (mode === 'tests' && !cfg.tests) fail('stop gate is "tests" but sdd.json has no tests command');
else ok(`stop gate: ${mode}`);
if (!cfg.format) info('no formatter in sdd.json: post-edit hook is idle');
if (cfg.formatScope !== undefined && !['all', 'new'].includes(cfg.formatScope)) fail(`sdd.json: formatScope "${cfg.formatScope}" must be all or new`);
else if (cfg.format && cfg.formatScope === 'new') info('formatter runs on new files only (formatScope "new"): format the rest in a commit of its own, then set it to "all"');
if (cfg.testFiles) { try { new RegExp(cfg.testFiles); } catch (e) { fail(`sdd.json: testFiles is not a valid regular expression (${e.message})`); } }
const pk = packageEntries(dir);
if (pk.error) fail(`sdd.json: ${pk.error}`);
for (const e of pk.entries) if (!e.dirs.length) warn(`sdd.json: the packages entry "${e.pattern}" matches no folder`);
const own = cfg.guardRules ?? [];
if (!Array.isArray(own)) fail('sdd.json: guardRules must be a list, so guard runs none of its project rules');
else {
  for (const r of own) {
    try { new RegExp(r?.pattern); } catch (e) { fail(`sdd.json guardRules: ${JSON.stringify(r?.pattern)} is not a valid regular expression, so guard skips it (${e.message})`); continue; }
    if (!r?.pattern || !r?.why) fail(`sdd.json guardRules: every rule needs a pattern and a why (${JSON.stringify(r)})`);
  }
}
try {
  const settings = JSON.parse(read(p('.claude', 'settings.json')));
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    for (const h of groups.flatMap((g) => g.hooks || [])) {
      const script = (h.args || []).map((a) => String(a).replace('${CLAUDE_PROJECT_DIR}', dir)).find((a) => a.endsWith('.mjs'));
      if (!script) continue;
      if (!existsSync(script)) { fail(`${event} hook script missing: ${relative(dir, script).replace(/\\/g, '/')}`); continue; }
      const r = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
      if (r.status !== 0) fail(`${event} hook ${relative(dir, script)} has a syntax error: ${r.stderr.split('\n')[0]}`);
    }
  }
  ok('hook scripts present and parse');
} catch (e) { fail(`.claude/settings.json: ${e.message}`); }

// 6. Generated files: package settings stubs, and the Codex copies
const SYNC = 'node .claude/skills/onboard/scripts/sync.mjs';
if (codex && !existsSync(p('.claude', 'hooks', 'protect.mjs'))) warn('codex is true but .claude/hooks/protect.mjs is missing, so Codex edits ignore permissions.deny: run setup.mjs --codex');
{
  const s = stale(dir), c = conflicts(dir);
  if (s.length) fail(`generated files are stale (${s.length}: ${s.slice(0, 3).join(', ')}${s.length > 3 ? ', …' : ''}): ${SYNC}`);
  else if (codex || pk.entries.length) ok(`generated files are current${codex ? ', Codex copies included' : ''}`);
  for (const f of c) {
    warn(f.endsWith('/.claude/settings.json')
      ? `${f} exists and was not generated by the kit, so a session started in that folder runs none of the root hooks: copy the hooks into it by hand, or ${SYNC} --force`
      : `${f} exists and was not generated by the kit, so Codex uses it instead of the kit's copy: merge by hand, or ${SYNC} --force`);
  }
}

// 7. OpenSpec and work in progress
const v = sh('openspec --version', 30_000);
if (!v.ok) warn('openspec CLI not found: npm install -g @fission-ai/openspec');
else ok(`openspec ${v.out.trim().split('\n').at(-1)}`);
if (!existsSync(p('openspec', 'config.yaml'))) fail('openspec/config.yaml is missing');
else if (/Project: <name>|Stack: <|actually follows: </.test(read(p('openspec', 'config.yaml')))) warn('openspec/config.yaml context still has placeholders (/onboard)');
const changes = p('openspec', 'changes');
for (const name of existsSync(changes) ? readdirSync(changes).filter((n) => n !== 'archive' && statSync(join(changes, n)).isDirectory()) : []) {
  const meta = existsSync(join(changes, name, '.openspec.yaml')) ? read(join(changes, name, '.openspec.yaml')) : '';
  const created = meta.match(/created:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const days = created ? Math.floor((Date.now() - Date.parse(created)) / 864e5) : null;
  (days !== null && days > 14 ? warn : info)(`change in progress: ${name}${days !== null ? ` (${days} days)` : ''}`);
}
const notes = md(p('docs', 'solutions')).filter((f) => !f.endsWith('README.md')).length;
(notes > 30 ? warn : info)(`docs/solutions: ${notes} note(s)${notes > 30 ? ' — consolidate or turn repeated lessons into checks' : ''}`);

// 8. --full: run the real checks once, timed (helps choose the stop-gate mode: tests under ~60 s → "tests")
if (full) {
  if (v.ok) { const r = sh('openspec validate --all --strict'); (r.ok ? ok : fail)(`openspec validate --all --strict (${r.s} s)${r.ok ? '' : `\n${r.out.trim().split('\n').slice(-8).join('\n')}`}`); }
  for (const key of ['typecheck', 'lint', 'tests', 'build']) {
    if (!cfg[key]) continue;
    const r = sh(cfg[key]);
    (r.ok ? ok : fail)(`${key}: \`${cfg[key]}\` ${r.ok ? 'passed' : 'FAILED'} in ${r.s} s`);
  }
}

for (const [level, m] of results) console.log(`${level}  ${m}`);
const fails = results.filter(([l]) => l === 'FAIL').length, warns = results.filter(([l]) => l === 'WARN').length;
console.log(`\n${fails} fail, ${warns} warn`);
process.exit(fails ? 1 : 0);
