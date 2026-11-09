// PreToolUse (Bash and PowerShell in Claude Code, Bash in Codex): block destructive commands, commands that discard
// uncommitted work, publishing, reading secret env files, and commits that contain secrets. A best-effort guardrail
// that catches common slips, not a sandbox: a determined or obfuscated command can get past a regex. What must never
// happen also belongs in permissions.deny or the client's sandbox settings.
// Project rules live in "guardRules" of .claude/sdd.json, so this script stays the kit's and can be updated.
// Patterns come from efp3d-sandbox (ideas from affaan-m/ECC).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readInput, projectDir, shellCommand, git, block, loadConfig } from './lib.mjs';

const input = readInput();
const cmd = shellCommand(input);
if (!cmd) process.exit(0);
const dir = projectDir();

const deny = (why) => block('PreToolUse', `Blocked by .claude/hooks/guard.mjs: ${why}. Ask the user to run it themselves if it is really needed.`);
const END = String.raw`(?=$|[\s;&|)])`;
// Searching for a phrase is not running it: `grep "DROP TABLE"` or `git log -S "drop table"` are reads.
const SEARCH = String.raw`(?:grep|egrep|fgrep|rg|ag|ack|git|findstr|Select-String|sls)\b`;

const rules = [
  [String.raw`\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+(-[a-zA-Z]+\s+)*["']?(/|~|\$HOME|\.{1,2}/?|\*|\./\*)["']?${END}`,
    'recursive delete of a root, home or project directory'],
  // PowerShell: Remove-Item and its aliases with -Recurse (or -r), in either order, on a root, drive, home or the project.
  [String.raw`(?<!\bgit\s+)\b(Remove-Item|ri|rm|del|erase|rd|rmdir)\b(?=[^;&|]*\s-r(ecurse)?\b)[^;&|]*\s["']?(/|\\|[a-z]:\\?|~|\$HOME|\$env:USERPROFILE|\.{1,2}[\\/]?|\*|\.[\\/]\*)["']?${END}`,
    'recursive delete of a root, drive, home or project directory'],
  [String.raw`\bgit\s+push\b[^;&|]*\s(?:(?:--force\S*|-f)${END}|\+\S)`, 'force push'],
  [String.raw`\bgit\s+push\b[^;&|]*[\s:](main|master)${END}`, 'push to the default branch; open a PR instead'],
  [String.raw`\bgit\s+reset\b[^;&|]*\s--hard\b`, 'git reset --hard discards work'],
  [String.raw`\bgit\s+clean\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*f`, 'git clean -f deletes untracked files'],
  // A ref never starts with "." and "--" always separates paths, so these overwrite files, not switch branches.
  [String.raw`\bgit\s+checkout\b[^;&|]*\s(?:--(?=\s)|(?:-f|--force)${END}|\.(?:[\\/]\S*)?${END}|:/)`, 'git checkout over files discards their local changes'],
  [String.raw`\bgit\s+switch\b[^;&|]*\s(?:--discard-changes|-f|--force)${END}`, 'git switch that discards local changes'],
  // restore touches the working tree unless it is given only --staged (-S); --worktree (-W) brings it back.
  [String.raw`\bgit\s+restore\b(?=[^;&|]*\s(?:--worktree|-W)${END}|(?![^;&|]*\s(?:--staged|-S)${END}))`, 'git restore discards local changes'],
  [String.raw`\bgit\s+stash\s+(drop|clear)\b`, 'deleting stashed work'],
  [String.raw`\b(npm|pnpm|yarn|bun)\s+publish\b(?![^;&|]*\s--dry-run\b)`, 'publishing a package'],
  [String.raw`(?:^|[;&|(\n])\s*(?!\s|${SEARCH})[^;&|\n]*\b(?:drop\s+(?:table|database|schema)|truncate\s+table)\b`, 'destructive SQL'],
  [String.raw`(^|[\s;&|(])(cat|less|more|head|tail|bat|type|nl|strings|grep|rg|sed|awk|base64|xxd|od|Get-Content|gc|Select-String|sls)\b[^;&|]*?(^|[\s/\\"'])\.env(\.(?!example\b|sample\b|template\b)[\w.-]+)?${END}`,
    'reading a secret env file; read .env.example instead'],
];
for (const [pattern, why] of rules) {
  if (new RegExp(pattern, 'i').test(cmd)) deny(why);
}

const own = loadConfig(dir).guardRules; // a broken entry is skipped here and reported by doctor
for (const rule of Array.isArray(own) ? own : []) {
  let re;
  try { re = new RegExp(rule?.pattern, 'i'); } catch { continue; }
  if (rule?.pattern && re.test(cmd)) deny(`${rule.why || `matches ${rule.pattern}`} (guardRules in .claude/sdd.json)`);
}

// Recursive deletes of anything git tracks, or of new files .gitignore does not exclude: agents leave commits to the
// user, so that is usually the uncommitted change itself. Build output and dependencies are ignored, so they pass.
const words = (s) => [...s.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
const recursiveFlag = (a) => /^-[fiIrRvd]*[rR][fiIrRvd]*$/.test(a) || a === '--recursive' || /^-r(e(c(u(r(se?)?)?)?)?)?$/i.test(a);
for (const segment of cmd.split(/&&|\|\||[;|&\n]/)) {
  const w = words(segment);
  while (w.length && (/^[A-Za-z_]\w*=/.test(w[0]) || w[0] === 'sudo')) w.shift();
  if (!w.length || !/^(rm|Remove-Item|ri|del|erase|rd|rmdir)$/i.test(w[0]) || !w.slice(1).some(recursiveFlag)) continue;
  const dash = w.indexOf('--');
  const targets = w.slice(1).filter((a, n) => (dash >= 0 && n + 1 > dash) || !a.startsWith('-')).flatMap((a) => a.split(','));
  for (const target of targets.filter((t) => t && !t.includes('$'))) {
    const held = git(input.cwd || dir, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--directory', '--no-empty-directory', '--', target]);
    if (held) deny(`recursive delete of ${target}, which holds files git tracks or .gitignore does not exclude; uncommitted work there would be lost`);
  }
}

// Secrets in a commit. Whatever form the commit takes (staged changes, -a, a pathspec, --amend), what it adds comes
// from the staged or the unstaged changes, so scan both. `git add -A && git commit` in one command stages new files
// only after this hook has run, so then the new files are scanned too.
if (/\bgit\b[^;&|]*\scommit\b/.test(cmd)) {
  const repo = cmd.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/)?.[1]?.replace(/^["']|["']$/g, '') || dir;
  const added = `${git(repo, ['diff', '--cached', '-U0']) || ''}${git(repo, ['diff', '-U0']) || ''}`;
  const lines = added.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  const secret = /AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}|sk-(ant-|proj-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
  if (secret.test(lines)) {
    block('PreToolUse', 'Blocked by .claude/hooks/guard.mjs: the staged or unstaged changes contain what looks like a secret. Move it to an env variable and take it out of the change.');
  }
  if (/\bgit\b[^;&|]*\sadd\b/.test(cmd)) {
    const untracked = (git(repo, ['ls-files', '-z', '--others', '--exclude-standard']) || '').split('\0').filter(Boolean);
    for (const f of untracked.slice(0, 2000)) {
      let data;
      try { if (statSync(join(repo, f)).size > 1_048_576) continue; data = readFileSync(join(repo, f)); } catch { continue; }
      if (!data.includes(0) && secret.test(data.toString('utf8'))) {
        block('PreToolUse', `Blocked by .claude/hooks/guard.mjs: the new file ${f} contains what looks like a secret. Move it to an env variable and keep the file out of the commit.`);
      }
    }
  }
}
process.exit(0);
