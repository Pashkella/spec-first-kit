#!/usr/bin/env node
// spec-first-kit. The working tree as a git tree id, for review without commits. Agents leave commits to the user,
// so `git diff <base>...HEAD` shows none of their work, and the files they create are untracked, so a plain
// `git diff` misses those too. A snapshot holds tracked files with their current content plus every untracked file
// that .gitignore does not exclude.
//
//   node .claude/skills/sdd/scripts/snapshot.mjs                 print a tree id of the working tree as it is now
//   node .claude/skills/sdd/scripts/snapshot.mjs --base [<ref>]  print the review base: the merge-base of HEAD with <ref> (default:
//                                                 origin/HEAD, then main, then master); HEAD when none exists; the
//                                                 empty tree when there is no commit yet
// Then: git diff --stat <base> <tree>, git diff <base> <tree> -- <file>. A re-review diffs two snapshots.
// It writes only git objects and a temporary index under the git dir (per worktree); the files, the real index and
// the branches stay as they are. Plain Node and git, the same on every system.
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const MAX_UNTRACKED = 5000; // more usually means a build or dependency folder missing from .gitignore

const git = (args, opts = {}) => {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};
const die = (message) => { console.error(`snapshot: ${message}`); process.exit(1); };
const emptyTree = () => git(['hash-object', '-t', 'tree', '--stdin'], { input: '' }).out;

const root = git(['rev-parse', '--show-toplevel']);
if (!root.ok) die('not inside a git repository');
const cwd = root.out;
const hasHead = git(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd }).ok;

const args = process.argv.slice(2);
if (args[0] === '--base') {
  if (!hasHead) { console.log(emptyTree()); process.exit(0); }
  const origin = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd });
  const ref = [args[1], origin.ok && origin.out, 'main', 'master']
    .find((r) => r && git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`], { cwd }).ok);
  if (!ref) { console.error('snapshot: no default branch found; using HEAD as the base'); console.log(git(['rev-parse', 'HEAD'], { cwd }).out); process.exit(0); }
  const base = git(['merge-base', 'HEAD', ref], { cwd });
  console.log(base.ok ? base.out : git(['rev-parse', 'HEAD'], { cwd }).out);
  process.exit(0);
}

const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd });
const count = untracked.out ? untracked.out.split('\0').filter(Boolean).length : 0;
if (count > MAX_UNTRACKED) die(`${count} untracked files: add build and dependency folders to .gitignore first`);

const rel = (p) => resolve(cwd, p);
const index = rel(git(['rev-parse', '--git-path', 'index'], { cwd }).out);
const temp = rel(git(['rev-parse', '--git-path', `kit-snapshot-${process.pid}.index`], { cwd }).out);
try {
  if (existsSync(index)) copyFileSync(index, temp); // start from the real index: unchanged files are not re-read
  const env = { ...process.env, GIT_INDEX_FILE: temp };
  const add = git(['add', '-A', '--', '.'], { cwd, env });
  if (!add.ok) die(add.err || 'git add failed');
  const tree = git(['write-tree'], { cwd, env });
  if (!tree.ok) die(tree.err || 'git write-tree failed');
  console.log(tree.out);
} finally {
  rmSync(temp, { force: true });
}
