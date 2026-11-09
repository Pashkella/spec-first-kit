#!/usr/bin/env node
// spec-first-kit: installs the kit into a project, a new empty folder or an existing repository.
// Plain Node, no dependencies, same on Windows, macOS and Linux.
//
//   node setup.mjs <project-dir>                      install for Claude Code (later runs add only what is missing)
//   node setup.mjs <project-dir> --codex              also for Codex: the protect hook and the generated copies
//   node setup.mjs <project-dir> --from <file.md>     also copy a product document for /onboard to read
//   node setup.mjs <project-dir> --update             update every kit file that nobody changed here
//   options: --dry-run (print the plan only), --force (also replace kit files changed here, with a backup; never the
//            files /onboard fills), --no-codex (turn Codex off: its hook, deny entries and generated copies go)
//
// Ownership lives in .claude/sdd.lock.json: the hash of every file the kit wrote. --update replaces a file only while
// it still has that hash; a file changed here stays, and the kit's new version goes to .claude/.cache/kit-new/ for
// comparison. A file deleted here stays deleted. settings.json and sdd.json are merged, never replaced. On a first
// install, an existing AGENTS.md or CLAUDE.md is renamed to *.old.md, and /onboard merges what is still true.
// Replaced and deleted files are copied to .claude/.cache/kit-backup/<time>/ first.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 12)) {
  console.error(`spec-first-kit needs Node 20.12 or newer (OpenSpec needs 20.19+); this is ${process.versions.node}.`);
  process.exit(1);
}

const KIT = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(KIT, 'template');
const meta = JSON.parse(readFileSync(join(KIT, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const fromIndex = args.indexOf('--from');
const from = fromIndex >= 0 ? args[fromIndex + 1] : null;
const target = args.find((a, i) => !a.startsWith('--') && (fromIndex < 0 || i !== fromIndex + 1));
const usage = `Usage: node setup.mjs <project-dir> [--codex | --no-codex] [--from <document.md>] [--update] [--dry-run] [--force]`;
if (!target || (fromIndex >= 0 && !from)) { console.log(`${meta.name} ${meta.version}\n${usage}`); process.exit(1); }
if (flag('--codex') && flag('--no-codex')) { console.error(`--codex and --no-codex exclude each other\n${usage}`); process.exit(1); }
if (from && !existsSync(from)) { console.error(`--from: ${from} does not exist`); process.exit(1); }
const dir = resolve(target);
const dry = flag('--dry-run'), update = flag('--update'), force = flag('--force');

const LOCK = '.claude/sdd.lock.json';
const CONFIG = '.claude/sdd.json';
const SETTINGS = '.claude/settings.json';
const SYNC = '.claude/skills/onboard/scripts/sync.mjs';
const CODEX_ONLY = ['.claude/hooks/protect.mjs'];
const CODEX_DENY = ['Edit(./.agents/skills/**)', 'Edit(./.codex/**)'];
// Templates that /onboard fills: --force never replaces them once they changed.
const SCAFFOLD = [/^AGENTS\.md$/, /^CLAUDE\.md$/, /^openspec\//, /^docs\//, /^\.claude\/agents\/implementer\.md$/,
  /^\.claude\/skills\/run-app\//, /^\.claude\/rules\//, /^\.claude\/review-rules\//];
const isScaffold = (rel) => SCAFFOLD.some((r) => r.test(rel));

const log = [];
const act = (verb, what, fn) => { log.push(`${verb.padEnd(7)} ${what}`); if (!dry && fn) fn(); };
const read = (p) => readFileSync(p, 'utf8');
const readJson = (rel) => { try { return JSON.parse(read(join(dir, rel))); } catch { return null; } };
// A CRLF checkout (core.autocrlf) is not a change: text is hashed with LF line endings; a file with a NUL byte is binary.
const lf = (b) => (b.includes(0) ? b : Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
const hash = (b) => createHash('sha256').update(lf(b)).digest('hex');
const diskHash = (rel) => hash(readFileSync(join(dir, rel)));
const kitHash = (rel) => hash(readFileSync(join(TEMPLATE, rel)));
const walk = (root) => readdirSync(root, { withFileTypes: true }).flatMap((e) => {
  if (e.isDirectory()) return ['.cache', '.git', 'node_modules'].includes(e.name) ? [] : walk(join(root, e.name)).map((f) => `${e.name}/${f}`);
  return e.isFile() ? [e.name] : [];
});
const copy = (rel) => { const to = join(dir, rel); mkdirSync(dirname(to), { recursive: true }); copyFileSync(join(TEMPLATE, rel), to); };
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const backup = (rel) => { const b = join(dir, '.claude', '.cache', 'kit-backup', stamp, rel); mkdirSync(dirname(b), { recursive: true }); copyFileSync(join(dir, rel), b); };
const kitNew = (rel) => { const to = join(dir, '.claude', '.cache', 'kit-new', rel); mkdirSync(dirname(to), { recursive: true }); copyFileSync(join(TEMPLATE, rel), to); };
const remove = (rel) => {
  rmSync(join(dir, rel));
  for (let d = dirname(join(dir, rel)); relative(dir, d) && !relative(dir, d).startsWith('..') && !readdirSync(d).length; d = dirname(d)) rmSync(d, { recursive: true });
};
const freeName = (rel) => { let n = rel.replace(/\.md$/, '.old.md'), i = 2; while (existsSync(join(dir, n))) n = rel.replace(/\.md$/, `.old${i++}.md`); return n; };

if (!existsSync(dir)) act('mkdir', dir, () => mkdirSync(dir, { recursive: true }));
else if (!statSync(dir).isDirectory()) { console.error(`${dir} is not a folder`); process.exit(1); }

const lock = readJson(LOCK);
const owned = lock?.files ?? {};
// No lock and no sdd.json: the kit was never here, so an AGENTS.md or CLAUDE.md that exists is the project's own.
const firstInstall = !lock && !existsSync(join(dir, CONFIG));

const curConfig = readJson(CONFIG);
const codex = flag('--codex') ? true : flag('--no-codex') ? false
  : typeof curConfig?.codex === 'boolean' ? curConfig.codex
  : Object.keys(lock?.generated || {}).some((p) => /^\.(agents|codex)\//.test(p));

const templateFiles = walk(TEMPLATE).filter((rel) => codex || !CODEX_ONLY.includes(rel));
const nextFiles = {};
if (update && !dry) rmSync(join(dir, '.claude', '.cache', 'kit-new'), { recursive: true, force: true });

// --- settings.json: merged, so the project's permissions, hooks and other keys stay -----------------------------------
function mergeSettings(cur, kit) {
  const out = { ...cur, permissions: { ...(cur.permissions || {}) }, hooks: { ...(cur.hooks || {}) } };
  const dropped = codex ? [] : CODEX_DENY; // --no-codex takes the Codex deny entries back
  for (const key of ['allow', 'deny']) {
    const own = (cur.permissions?.[key] || []).filter((e) => key !== 'deny' || !dropped.includes(e));
    out.permissions[key] = [...new Set([...own, ...(kit.permissions?.[key] || [])])];
  }
  for (const [event, groups] of Object.entries(kit.hooks || {})) {
    const mine = (out.hooks[event] || []).map((g) => ({ ...g, hooks: [...(g.hooks || [])] }));
    for (const g of groups) {
      let into = mine.find((m) => (m.matcher || '') === (g.matcher || ''));
      if (!into) { into = { ...(g.matcher ? { matcher: g.matcher } : {}), hooks: [] }; mine.push(into); }
      for (const h of g.hooks) {
        const sameHook = (x) => x.command === h.command && JSON.stringify(x.args || []) === JSON.stringify(h.args || []);
        // A kit hook that moved to another matcher (Bash → Bash|PowerShell) leaves its old group, so it runs once.
        for (const m of mine) if (m !== into) m.hooks = m.hooks.filter((x) => !sameHook(x));
        if (!into.hooks.some(sameHook)) into.hooks.push(h);
      }
    }
    out.hooks[event] = mine.filter((m) => m.hooks.length);
  }
  return out;
}

function settingsFile() {
  const kit = JSON.parse(read(join(TEMPLATE, SETTINGS)));
  if (codex) kit.permissions.deny = [...kit.permissions.deny, ...CODEX_DENY];
  const to = join(dir, SETTINGS);
  if (!existsSync(to)) {
    act('add', SETTINGS, () => { mkdirSync(dirname(to), { recursive: true }); if (codex) writeFileSync(to, `${JSON.stringify(kit, null, 2)}\n`); else copy(SETTINGS); });
    return;
  }
  const cur = JSON.parse(read(to));
  const merged = mergeSettings(cur, kit);
  if (JSON.stringify(merged) !== JSON.stringify(cur)) act('merge', SETTINGS, () => { backup(SETTINGS); writeFileSync(to, `${JSON.stringify(merged, null, 2)}\n`); });
}

// --- sdd.json: new keys added, the project's values kept ------------------------------------------------------------
function configFile() {
  const kit = JSON.parse(read(join(TEMPLATE, CONFIG)));
  const cur = curConfig || {};
  const merged = {};
  for (const k of Object.keys(kit)) merged[k] = k === '_doc' ? kit._doc : k in cur ? cur[k] : kit[k];
  for (const k of Object.keys(cur)) if (!(k in merged)) merged[k] = cur[k];
  merged.codex = codex;
  const text = `${JSON.stringify(merged, null, 2)}\n`;
  if (!curConfig) act('add', CONFIG, () => { mkdirSync(dirname(join(dir, CONFIG)), { recursive: true }); writeFileSync(join(dir, CONFIG), text); });
  else if (JSON.stringify(merged) !== JSON.stringify(cur)) act('merge', CONFIG, () => { backup(CONFIG); writeFileSync(join(dir, CONFIG), text); });
  return merged;
}

// --- every other kit file ------------------------------------------------------------------------------------------
let config = null;
for (const rel of templateFiles) {
  if (rel === SETTINGS) { settingsFile(); continue; }
  if (rel === CONFIG) { config = configFile(); continue; }
  const to = join(dir, rel);
  const known = rel in owned;
  if (!existsSync(to)) {
    // Deleted here on purpose (an empty docs template, say): it stays deleted unless --force brings it back.
    if (known && !force) { nextFiles[rel] = owned[rel]; continue; }
    act('add', rel, () => copy(rel));
    nextFiles[rel] = kitHash(rel);
    continue;
  }
  if (diskHash(rel) === kitHash(rel)) { nextFiles[rel] = kitHash(rel); continue; }
  if (firstInstall && (rel === 'AGENTS.md' || rel === 'CLAUDE.md')) {
    const old = freeName(rel);
    act('rename', `${rel} → ${old}`, () => { renameSync(to, join(dir, old)); copy(rel); });
    nextFiles[rel] = kitHash(rel);
    continue;
  }
  const untouched = known && owned[rel] === diskHash(rel);
  if ((untouched && update) || (force && !isScaffold(rel))) {
    act('update', rel, () => { backup(rel); copy(rel); });
    nextFiles[rel] = kitHash(rel);
    continue;
  }
  if (untouched) { log.push(`old     ${rel} (unchanged here; --update replaces it)`); nextFiles[rel] = owned[rel]; continue; }
  // Changed here, or a file of the same name the kit did not write.
  if (known) nextFiles[rel] = owned[rel];
  if (update || !known) {
    const why = known ? 'changed here' : 'not written by the kit';
    log.push(`keep    ${rel} (${why}${update ? `; the kit's version: .claude/.cache/kit-new/${rel}` : ''}${isScaffold(rel) ? '' : '; --force replaces it'})`);
    if (update && !dry) kitNew(rel);
  }
}

// Files the kit wrote that it no longer ships: deleted on --update while unchanged (with a backup), kept when changed.
for (const rel of Object.keys(owned).filter((r) => !templateFiles.includes(r) && r !== SETTINGS && r !== CONFIG)) {
  if (!existsSync(join(dir, rel))) continue;
  const untouched = owned[rel] === diskHash(rel);
  if (!update && !(flag('--no-codex') && CODEX_ONLY.includes(rel))) {
    nextFiles[rel] = owned[rel];
    if (untouched) log.push(`old     ${rel} (no longer part of the kit; --update deletes it)`);
    continue;
  }
  if (untouched || force) act('delete', rel, () => { backup(rel); remove(rel); });
  else log.push(`keep    ${rel} (changed here and no longer part of the kit: delete it when you no longer need it)`);
}

// --- product document --------------------------------------------------------------------------------------------
let source = null;
if (from) {
  source = `docs/product/sources/${basename(from)}`;
  const to = join(dir, source);
  const same = (a, b) => lf(readFileSync(a)).equals(lf(readFileSync(b)));
  if (existsSync(to) && same(to, from)) log.push(`keep    ${source}`);
  else act(existsSync(to) ? 'replace' : 'add', `${source} (from ${from})`, () => { mkdirSync(dirname(to), { recursive: true }); if (existsSync(to)) backup(source); copyFileSync(from, to); });
  // Files it links by a relative path (images, attachments, other notes) go along, so its links keep working.
  const home = dirname(resolve(from));
  for (const link of linkedFiles(read(from))) {
    const abs = resolve(home, link), rel = relative(home, abs).replace(/\\/g, '/');
    if (rel.startsWith('..') || isAbsolute(rel)) { log.push(`warn    ${link}: linked from ${basename(from)} but outside its folder; copy it into docs/product/sources/ by hand`); continue; }
    if (!existsSync(abs) || !statSync(abs).isFile()) { log.push(`warn    ${link}: linked from ${basename(from)} but not found`); continue; }
    const dest = `docs/product/sources/${rel}`, out = join(dir, dest);
    if (existsSync(out) && readFileSync(out).equals(readFileSync(abs))) continue;
    act(existsSync(out) ? 'replace' : 'add', `${dest} (linked from ${basename(from)})`, () => { mkdirSync(dirname(out), { recursive: true }); if (existsSync(out)) backup(dest); copyFileSync(abs, out); });
  }
}

// Relative link targets in a Markdown document: [text](path), ![alt](path), [ref]: path, <img src="path">.
function linkedFiles(text) {
  const found = [...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)|^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)|<img\s[^>]*?src=["']([^"']+)["']/gim)]
    .map((m) => m[1] || m[2] || m[3]);
  const clean = (l) => { try { return decodeURI(l.split(/[?#]/)[0]); } catch { return l.split(/[?#]/)[0]; } };
  return [...new Set(found.map(clean))].filter((l) => l && !/^[a-z][a-z0-9+.-]*:/i.test(l) && !l.startsWith('/') && !l.startsWith('\\'));
}

// A folder inside a bigger git repository is usually a package of a monorepo. The kit belongs at the repository root:
// Codex runs its hooks from there, and the reviewer's snapshot covers the whole repository.
if (existsSync(dir)) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  // Real paths: git prints the long, symlink-free spelling (no macOS /var alias, no Windows 8.3 names).
  const norm = (x) => { let r; try { r = realpathSync.native(x); } catch { r = resolve(x); } return process.platform === 'win32' ? r.toLowerCase() : r; };
  if (top.status === 0 && norm(top.stdout.trim()) !== norm(dir)) {
    log.push(`warn    ${dir} is inside the git repository ${top.stdout.trim()}; in a monorepo, install the kit at the repository root and list the packages under "packages" in ${CONFIG} (README, Monorepos)`);
  }
}

// .gitignore: append what the kit needs.
const ignore = read(join(KIT, 'gitignore.kit')).split(/\r?\n/).filter(Boolean);
const gi = join(dir, '.gitignore');
const have = existsSync(gi) ? read(gi).split(/\r?\n/) : [];
const missing = ignore.filter((l) => !have.includes(l));
if (missing.length) act('ignore', missing.join(' '), () => writeFileSync(gi, `${have.join('\n').replace(/\n*$/, '\n')}${missing.join('\n')}\n`.replace(/^\n/, '')));

// The lock: written last, so an interrupted run leaves the old one and the next run picks up where this one stopped.
const sorted = Object.fromEntries(Object.entries(nextFiles).sort(([a], [b]) => (a < b ? -1 : 1)));
const nextLock = `${JSON.stringify({ kit: meta.name, version: meta.version, files: sorted, ...(lock?.generated ? { generated: lock.generated } : {}) }, null, 2)}\n`;
if (!dry && (!existsSync(join(dir, LOCK)) || !lf(readFileSync(join(dir, LOCK))).equals(lf(Buffer.from(nextLock))))) {
  mkdirSync(dirname(join(dir, LOCK)), { recursive: true });
  writeFileSync(join(dir, LOCK), nextLock);
}

console.log(`${meta.name} ${meta.version} → ${dir}${dry ? ' (dry run)' : ''}\n${log.join('\n') || 'nothing to do'}`);
if (!dry && log.some((l) => /^(update|merge|replace|delete|rewrite)/.test(l))) console.log(`Old copies: .claude/.cache/kit-backup/${stamp}/`);
if (dry) process.exit(0);

// Generated files: the Codex copies, the settings stub of each monorepo package, and removing them when they go.
if (codex || config?.packages?.length || Object.keys(lock?.generated || {}).length) {
  const r = spawnSync(process.execPath, [join(dir, SYNC), '--dir', dir], { encoding: 'utf8' });
  console.log(`${r.stdout || ''}${r.stderr || ''}`.trim());
}
const isGit = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, encoding: 'utf8' }).status === 0;
const hasOpenspec = spawnSync('openspec --version', { shell: true, encoding: 'utf8' }).status === 0;
const onboard = source ? `onboard ${source}` : 'onboard';
// The same signal as the session-start hook: /onboard replaces the template's first line.
const onboarded = existsSync(join(dir, 'AGENTS.md')) && !read(join(dir, 'AGENTS.md')).includes('<project name>');
console.log(`
Next:
${isGit ? '' : '  - git init: the hooks and the SDD flow use git (branches, diffs, the stop gate).\n'}${hasOpenspec ? '' : '  - npm install -g @fission-ai/openspec   (the sdd skill calls the openspec CLI)\n'}${onboarded ? '' : `  - Claude Code: open the project and run /${onboard}\n`}${codex ? `  - Codex: ${onboarded ? '' : `$${onboard}, then `}/hooks to trust the project hooks\n` : ''}  - ${onboarded ? 'Check' : 'Then'}: node .claude/skills/onboard/scripts/doctor.mjs${onboarded ? '' : ', and a first change with /sdd'}
`);
