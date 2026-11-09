#!/usr/bin/env node
// spec-first-kit. Scenario → test trace for one OpenSpec change: a computational check before review.
// Every scenario of an ADDED or MODIFIED requirement should have a test that names it: the implementer names each
// test after its scenario title (or puts the title in a comment above it). A name that matches is where the reviewer
// looks, not proof that the test asserts the THEN.
//
//   node .claude/skills/sdd/scripts/trace.mjs <change> [--dir <repo>]
//
// Per scenario: named (a test file contains its title) · anchored (none does, but the requirement's
// `<!-- … test: <file> -->` anchor from spec-miner points to an existing file; the anchor belongs to the requirement,
// so it says where to look, not that any test asserts this scenario) · manual (`<!-- manual: … -->` under the
// scenario header: no automated test, by decision) · short (a one-word title matches too much to count) · missing.
// Exit 1 when a scenario is missing or anchored: name the test that asserts it after the scenario, or write one.
// Matching ignores case, punctuation, camelCase and snake_case, in any language. Test files are tracked and
// untracked files whose path looks like a test; set "testFiles" (a regular expression) in .claude/sdd.json to override.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_FILE = [
  /(^|\/)(tests?|__tests__|spec|e2e|integration)\//i, // test folders (spec/ is RSpec; openspec/ is excluded below)
  /[._-](test|spec|e2e)\.[a-z0-9]+$/i, //               a.test.ts, a.spec.js, a_test.go, a-e2e.ts
  /(^|\/)test_[^/]+\.py$/, //                            test_a.py
  /[A-Za-z0-9](Tests?|Spec|IT)\.(java|kt|kts|cs|scala|groovy|swift|php)$/, // ATest.java, ATests.cs, ASpec.groovy
];
const NOT_TESTS = /^(openspec|docs|\.claude|\.agents|\.codex)\/|\.(md|mdx|snap|lock|map)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

const args = process.argv.slice(2);
const i = args.indexOf('--dir');
const dir = i >= 0 ? args[i + 1] : join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const change = args.find((a, n) => !a.startsWith('--') && (i < 0 || n !== i + 1));
if (!change) { console.error('Usage: node .claude/skills/sdd/scripts/trace.mjs <change> [--dir <repo>]'); process.exit(2); }
const changeDir = join(dir, 'openspec', 'changes', change);
if (!existsSync(join(changeDir, 'specs'))) { console.error(`trace: no delta specs in openspec/changes/${change}/specs/`); process.exit(2); }

// Words only: camelCase and snake_case split, case and punctuation dropped, ё read as е. Padded for whole-word search.
const norm = (s) => ` ${s.normalize('NFKC').replace(/([\p{Ll}\p{Nd}])(\p{Lu})/gu, '$1 $2').toLowerCase()
  .replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(root, e.name)) : [join(root, e.name)]));
}

// Scenarios of ADDED and MODIFIED requirements, with the requirement's test anchors and the scenario's manual note.
function scenarios(file) {
  const capability = relative(join(changeDir, 'specs'), dirname(file)).replace(/\\/g, '/');
  const out = [];
  let section = null, req = null, last = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i))) { section = m[1].toUpperCase(); req = last = null; continue; }
    if (/^##\s/.test(line)) { section = req = last = null; continue; }
    if ((m = line.match(/^###\s+Requirement:\s*(.+?)\s*$/))) { req = { name: m[1], tests: [] }; last = null; continue; }
    if ((m = line.match(/^####\s+Scenario:\s*(.+?)\s*$/))) {
      last = req && (section === 'ADDED' || section === 'MODIFIED') ? { capability, requirement: req.name, title: m[1], tests: req.tests, manual: null } : null;
      if (last) out.push(last);
      continue;
    }
    if ((m = line.match(/<!--(.*?)-->/))) {
      const test = m[1].match(/\btest:\s*([^·]+)/)?.[1];
      if (req && !last && test) req.tests.push(...test.split(',').map((t) => t.trim().replace(/#.*$/, '')).filter(Boolean));
      const manual = m[1].match(/^\s*manual:\s*(.+?)\s*$/)?.[1];
      if (last && manual) last.manual = manual;
    }
  }
  return out;
}

function testFiles() {
  let pattern = '', custom = null;
  try { pattern = JSON.parse(readFileSync(join(dir, '.claude', 'sdd.json'), 'utf8')).testFiles || ''; } catch { /* no sdd.json */ }
  if (pattern) {
    try { custom = new RegExp(pattern); } catch (e) { console.error(`trace: testFiles in .claude/sdd.json is not a valid regular expression: ${e.message}`); process.exit(2); }
  }
  const r = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) { console.error('trace: not a git repository'); process.exit(2); }
  return r.stdout.split('\0').filter(Boolean)
    .filter((f) => (custom ? custom.test(f) : !NOT_TESTS.test(f) && TEST_FILE.some((re) => re.test(f))))
    .filter((f) => { try { const s = statSync(join(dir, f)); return s.isFile() && s.size <= MAX_BYTES; } catch { return false; } })
    .map((f) => ({ file: f, text: norm(readFileSync(join(dir, f), 'utf8')) }));
}

const all = walk(join(changeDir, 'specs')).filter((f) => f.endsWith('spec.md')).flatMap(scenarios);
if (!all.length) { console.log(`trace ${change}: no ADDED or MODIFIED scenarios to trace`); process.exit(0); }
const tests = testFiles();
const counts = { named: 0, anchored: 0, manual: 0, short: 0, missing: 0 };
const lines = [];
for (const s of all) {
  const key = norm(s.title);
  const where = `${s.capability} / ${s.requirement} / ${s.title}`;
  const named = tests.filter((t) => t.text.includes(key)).map((t) => t.file);
  const anchored = s.tests.filter((t) => existsSync(join(dir, t)));
  let status;
  if (s.manual) status = 'manual';
  else if (key.trim().split(' ').length < 2) status = named.length ? 'short' : anchored.length ? 'anchored' : 'missing';
  else status = named.length ? 'named' : anchored.length ? 'anchored' : 'missing';
  counts[status]++;
  const detail = status === 'manual' ? s.manual : status === 'named' || status === 'short' ? named.slice(0, 3).join(', ')
    : status === 'anchored' ? `${anchored.join(', ')} (no test names it: put the scenario title in a comment above the test there that asserts it, or write one)`
    : 'no test names it';
  lines.push(`${status.padEnd(8)}  ${where} → ${detail}`);
}
console.log(`trace ${change}: ${all.length} scenario(s) in ${tests.length} test file(s): `
  + Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', '));
console.log(lines.join('\n'));
process.exit(counts.missing || counts.anchored ? 1 : 0);
