// Shared helpers for the hooks. Plain Node, no dependencies, same on Windows, macOS and Linux.
// The same scripts run under Claude Code (.claude/settings.json) and Codex (.codex/hooks.json): both send one JSON
// object on stdin and read a JSON decision from stdout.
import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// One spelling per path, so a path from the client and one built from this script's location compare equal:
// symlinks resolved (macOS /var → /private/var) and Windows 8.3 names expanded (RUNNER~1 → runneradmin). A file
// that does not exist yet (a new spec) keeps its missing tail under the canonical form of its nearest folder.
export function canonical(p) {
  for (let head = resolve(p), tail = ''; ; ) {
    try { return tail ? join(realpathSync.native(head), tail) : realpathSync.native(head); } catch { /* not there yet */ }
    const up = dirname(head);
    if (up === head) return resolve(p);
    tail = tail ? join(basename(head), tail) : basename(head);
    head = up;
  }
}

export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

export function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

// The kit's root: the folder that holds .claude/hooks/, where these scripts live. Neither client says it reliably:
// Claude Code sets CLAUDE_PROJECT_DIR to the folder it started in, a package of a monorepo with a settings stub, and
// Codex sets nothing and may start in a subfolder.
export function projectDir() {
  return canonical(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'));
}

// The Bash command of a PreToolUse event: a string in both tools; tolerate an argv array.
export function shellCommand(input) {
  const c = input?.tool_input?.command;
  return Array.isArray(c) ? c.join(' ') : typeof c === 'string' ? c : '';
}

// Files an edit touches, as absolute paths. Claude Code sends tool_input.file_path. Codex sends the apply_patch
// text in tool_input.command, with "*** Add File: …", "*** Update File: …", "*** Delete File: …" and
// "*** Move to: …" headers; its paths are relative to the session cwd.
export function editedPaths(input, dir) {
  const base = input?.cwd || dir;
  const file = input?.tool_input?.file_path;
  const paths = file ? [String(file)]
    : [...shellCommand(input).matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/gm)].map((m) => m[1]);
  return paths.map((p) => canonical(isAbsolute(p) ? p : resolve(base, p)));
}

// The project's settings: commands, stop gate, formatter, guard rules, packages, codex.
export function loadConfig(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, '.claude', 'sdd.json'), 'utf8'));
  } catch {
    return {};
  }
}

// Runs a project command through the shell; returns { ok, output }.
export function run(dir, command, timeoutMs) {
  const r = spawnSync(command, { cwd: dir, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error) return { ok: false, output: `${output}\n${r.error.message}` };
  return { ok: r.status === 0, output };
}

export function tail(text, lines) {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join('\n');
}

// Blocks with a JSON decision on stdout and exit 0. Both Claude Code and Codex read this shape, and it is safer than
// exit code 2: some Codex builds on Windows treat exit 2 from PreToolUse as a hook failure and let the command run.
// PreToolUse → permissionDecision "deny". Stop → the agent keeps working with `reason` as its next prompt.
// PostToolUse (Claude Code) → `reason` is shown to the agent as feedback; the edit has already happened.
export function block(event, reason) {
  const out = event === 'PreToolUse'
    ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
    : { decision: 'block', reason };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Lets the action go on and shows the user a warning: `systemMessage` in both Claude Code and Codex.
export function warnUser(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}
