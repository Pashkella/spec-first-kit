// PreToolUse (Write|Edit), scoped to the spec-miner subagent in Claude Code: it may write only
// openspec/specs/<capability>/spec.md. Codex has no per-agent hooks, so there the rule lives in the agent's prompt.
import { relative, isAbsolute, resolve } from 'node:path';
import { readInput, projectDir, block, canonical } from './lib.mjs';

const input = readInput();
const file = input?.tool_input?.file_path || '';
const dir = projectDir();
const rel = relative(dir, canonical(isAbsolute(file) ? file : resolve(dir, file))).replace(/\\/g, '/');

if (/^openspec\/specs\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\/spec\.md$/.test(rel)) process.exit(0);
block('PreToolUse', `Blocked: spec-miner may only write openspec/specs/<capability>/spec.md (got: ${file})`);
