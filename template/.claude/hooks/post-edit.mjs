// PostToolUse on file edits (Claude Code: Edit|Write|MultiEdit; Codex: apply_patch): run the project formatter on the
// edited files, so style never costs a review round or a lint failure. Off until /onboard sets "format" in
// .claude/sdd.json ({file} = the path); "formatScope": "new" limits it to files with no committed version. A formatter
// that fails usually means a syntax error: the message goes back to the agent (the edit already happened).
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { readInput, projectDir, editedPaths, loadConfig, git, run, tail, block } from './lib.mjs';

const input = readInput();
const dir = projectDir();
const files = [...new Set(editedPaths(input, dir))].filter((f) => existsSync(f)); // a deleted or moved file is gone
if (!files.length) process.exit(0);

const cfg = loadConfig(dir);
const template = cfg.format;
if (!template) process.exit(0);

// formatScope "new": only files with no committed version. When the committed code is not formatted yet, formatting a
// whole file the agent touched would put unrelated lines into the diff.
const committed = (file) => git(dir, ['cat-file', '-e', `HEAD:./${relative(dir, file).replace(/\\/g, '/')}`]) !== null;
const failures = [];
for (const file of cfg.formatScope === 'new' ? files.filter((f) => !committed(f)) : files) {
  const quoted = `"${file.replace(/"/g, '\\"')}"`;
  const command = template.includes('{file}') ? template.replaceAll('{file}', quoted) : `${template} ${quoted}`;
  const { ok, output } = run(dir, command, 60_000);
  if (!ok) failures.push(`Formatter failed on ${file} (\`${command}\`):\n${tail(output, 15)}`);
}
if (failures.length) block('PostToolUse', failures.join('\n\n'));
process.exit(0);
