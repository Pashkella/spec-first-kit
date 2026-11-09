---
name: onboard
description: One-time setup of spec-first-kit for this repository, for an existing codebase or an empty new project, optionally from a product document. Sets the chat and spec languages, fills AGENTS.md, openspec/config.yaml, hook commands, path rules and run-app from the real repo, merges old agent instructions, records the test baseline, offers the Bash sandbox and a language-server plugin, regenerates derived files.
disable-model-invocation: true
argument-hint: "[path to a product document, or a short note]"
---

# Onboard

Goal: agents know how this repo really builds, tests and runs, and nothing more. Every line you add to AGENTS.md is
paid for in every session, and generated repo overviews make agents worse: write only what is true, non-obvious and
verified. Do not back-fill specs for code nobody is changing: specs grow one change at a time.

Existing code (a manifest and source files) → steps 0–7. Empty or nearly empty repo → "New project".
The argument is a path to a product document (idea write-up, PRD, spec) → it is read through the `intake` skill:
before anything else for a new project, after step 7 for an existing one.

## 0. Languages (ask once, both together)

1. Which language should agents use to talk to you? Default: the language of this conversation.
2. Which language for proposals and specs? Default: English. OpenSpec headings, SHALL/MUST and WHEN/THEN stay
   English either way; design.md and tasks.md stay English because agents read them most.

Write the first into the Conventions line of `AGENTS.md`, the second into the `Language:` line of the
`openspec/config.yaml` context. Changing either later is a one-line edit.

## 1. Map, proportional to the repo

- Small repo (under ~100 source files): read the manifests, CI config, README and entry points yourself.
- Large repo: two read-only explore subagents in parallel — (a) structure, entry points, generated code, risky
  areas; (b) toolchain: install, build, test, typecheck, lint and format commands, CI, env vars and services needed
  to run, test style and location.
- Monorepo (workspaces in `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `go.work`, a Cargo
  workspace): the kit lives at the repository root, and this onboarding runs there. Commands in step 3 cover the whole
  repository (`npm run test --workspaces --if-present`, `turbo run test`). Ask in which package folders people start
  Claude Code and list them under `packages` in `.claude/sdd.json` (`"packages/*"` is every folder under `packages/`):
  Claude Code reads `.claude/settings.json` only from the folder it starts in, and step 6 gives each listed folder a
  stub that runs the root hooks. Conventions of one package go into `.claude/rules/<package>.md` with
  `paths: ["packages/<name>/**"]`. OpenSpec stays one tree; prefix capability names with the package (`api-orders`).

## 2. Merge old instructions

`setup.mjs` renamed an existing `AGENTS.md` / `CLAUDE.md` to `*.old.md`. Also check `.cursor/rules/`, `.cursorrules`
and `.github/copilot-instructions.md`. Move the still-true rules into `AGENTS.md` (a nested `AGENTS.md` only for a
subsystem with its own rules, with a `CLAUDE.md` next to it holding the single line `@AGENTS.md`: Claude Code loads
nested `CLAUDE.md` files, not nested `AGENTS.md`). Show the user what moved and what was dropped as outdated or as something a linter
already enforces; delete the old files after they agree. `CLAUDE.md` stays the single line `@AGENTS.md`.

## 3. Fill the kit

Claude Code asks before every edit inside `.claude/`, even in accept-edits mode. Before the first one, tell the user
the prompt is coming and that "Yes, and allow Claude to edit files in this project's .claude folder for this session"
covers the rest of onboarding. Prepare the `.claude/` files first, then write them together.

- `AGENTS.md`: first line, Map (paths plus "read before …" pointers, not descriptions of every folder), Commands
  (taken from the manifests and CI; step 4 runs them, and only what works stays; the same commands go into
  `.claude/sdd.json`), generated paths in Never, the owner's language. Keep the file lean: procedures belong in skills,
  layer conventions in `.claude/rules/`. Test commands use a quiet reporter that still prints failures (`vitest --reporter=dot`,
  `jest --silent`, `pytest -q`, `go test ./...`): a command that prints thousands of lines on success burns context
  on every run.
- `.claude/sdd.json`: `typecheck`, `lint`, `tests` (the quiet full suite) and `build`, each the command
  or `""`; `format` (a command with `{file}`, e.g. `npx prettier --write --ignore-unknown {file}`, or `""`). Before
  setting `format`, run the formatter's check over the repo once (`npx prettier --check .`). Committed files it would
  change get reformatted whole the first time an agent edits them, and unrelated lines land in that diff. Tell the user
  how many there are and recommend formatting them in a commit of their own; until then set `formatScope` to `new`, so
  the hook formats only files that have no committed version.
- The kit's files are not project code: when the project's linter, formatter, typecheck or coverage would reach
  `.claude/`, `.agents/`, `.codex/` or `openspec/`, add those folders to its ignores (`ignores` in an ESLint flat
  config, `.prettierignore`, `exclude` in `tsconfig.json`, the coverage `exclude`). Otherwise the hooks and scripts
  fail lint, and the project's own format command rewrites the skills.
- `docs/architecture.md` and `docs/product/brief.md`: fill each from what the repo shows (README, entry points, module
  boundaries), well under a page. If there is too little to say yet, delete the file and its Map row: a Map row that
  points at a template sends every agent to read nothing.
- `openspec/config.yaml` `context`: name, stack, and the architecture rules the code actually follows (the
  `Language:` line comes from step 0).
- `.claude/settings.json`: add the repo's read-only and test commands to `permissions.allow` (e.g. `Bash(pnpm test*)`)
  and its generated folders to `permissions.deny` as `Edit(./path/**)`.
- `.claude/agents/implementer.md`: replace the `<!-- onboard: … -->` block with the 3–6 rules a worker must not break.
- `run-app` skill: prerequisites, start, smoke check, stop. Start the app once to prove the recipe.
- Conventions that differ by layer (UI components, API handlers, DB access, tests): one `.claude/rules/<layer>.md`
  per layer with `paths:` frontmatter, at most ~15 lines each, written from what the code actually does (neighbor
  patterns, error handling, naming, test style). In Claude Code a path rule loads only when an agent touches
  matching files, so it costs nothing elsewhere; it is the main way to make the implementer write code that fits the
  repo. With Codex enabled (`"codex": true` in `.claude/sdd.json`), `sync.mjs` lists them in a block of `AGENTS.md`
  (step 6), because Codex has no path rules of its own.
- Existing review conventions (CONTRIBUTING, PR template): one file per rule in `.claude/review-rules/<area>/`.
- Stack skills: if the stack has an established official agent skill, offer it. Install into `.claude/skills/<name>/`
  only if the user agrees, after reading it (a skill is instructions you run), and add its source, commit and license
  notice to `.claude/THIRD_PARTY.md`.
- Plugins with their own always-on workflow (for example superpowers: a session-start injection plus "invoke a skill
  before any response") compete with `sdd` and cost tokens every session. If one is enabled, say so and offer to
  disable it for this project.

## 4. Baseline and stop gate

Run `node .claude/skills/onboard/scripts/doctor.mjs --full` once on the untouched branch: it runs OpenSpec validation and every command
in `.claude/sdd.json` (typecheck, lint, tests, build), each once and timed. That is the baseline; do not run the
commands again separately. A command that fails because it is wrong, not because the code is red: fix it in both
`AGENTS.md` and `.claude/sdd.json` and re-run only that one. Then set `stopGate` in `.claude/sdd.json`:
- `tests` — all green and the full suite takes under ~1 minute;
- `typecheck` — tests are slow or already red;
- `off` — even typecheck is red. Then add a `Known red: <what fails>` line under Commands in `AGENTS.md`.

## 5. Sandbox and code intelligence (Claude Code: offer both, set up what the user accepts)

- Bash sandbox (`/sandbox`): the operating system limits what every shell command and its child processes may write
  and which hosts they reach. It is a real boundary, where `guard` is a list of patterns, and with it the
  `Read(...)` and `Edit(...)` entries of `permissions.deny` also hold for shell commands (`cat .env`, `sed -i` on the
  archive). macOS has it built in; Linux and WSL2 need `bubblewrap` and `socat` (Ubuntu 24.04+ also an AppArmor
  profile for bubblewrap; the `/sandbox` panel says what is missing). Native Windows has no sandbox: skip it there.
  - Writes inside the project stay allowed, so `guard` still covers `git reset --hard` and `rm -rf .`. Hooks, MCP
    servers and language servers run outside the sandbox, so the stop gate is unaffected.
  - The user picks the mode: auto-allow runs sandboxed commands without asking, regular keeps every prompt.
    `/sandbox` saves the choice in `.claude/settings.local.json` (this user, this project); put `sandbox.enabled`
    into the shared `.claude/settings.json` only if the team agrees.
  - A command that cannot work sandboxed (an e2e run that starts a Windows browser from WSL2, a tool writing outside
    the project) needs `sandbox.filesystem.allowWrite`, an allowed domain, or a narrow `sandbox.excludedCommands`
    entry. Write which one into `run-app`.
- Code intelligence: the language-server plugin for the stack gives the agent type errors and missing imports right
  after each edit, before the stop gate runs. It sees only the files the agent edited, so the stop gate stays.
  Install the server binary first (TypeScript: `npm install -g typescript-language-server typescript`), then the
  plugin (`/plugin install typescript-lsp@claude-plugins-official`; also `pyright-lsp`, `rust-analyzer-lsp`,
  `gopls-lsp`, `clangd-lsp`; look up the current list for other stacks). It does nothing in Codex or in cloud
  sessions.

## 6. Generated files and health

Ask whether anyone uses Codex in this repository. If yes and `"codex"` is still `false` in `.claude/sdd.json`, tell the
user to run the installer once more with `--codex` (it adds the Codex hook and deny entries); it does not touch what
onboarding wrote.

Then `node .claude/skills/onboard/scripts/sync.mjs` when Codex is on or `packages` is not empty: it writes the Codex
copies and the settings stub of each listed package. A `skip` line means a Codex skill, agent or hooks file of the
same name, or a package's own `.claude/settings.json`, already exists: show the user, then merge it by hand or re-run
with `--force` (the old file is backed up). Then `node .claude/skills/onboard/scripts/doctor.mjs` until it shows no
FAIL. With Codex, remind the user that Codex runs project hooks only after they trust them with `/hooks`.

## 7. Report

Files filled, commands verified, baseline, stop-gate mode, sandbox and plugin choices, placeholders still open.
Suggest one small real change for `/sdd`, or, if a product document was given, run `intake` with it now.

## New project

0. Languages: step 0 above.
1. A product document was given → run `intake` with it: it writes the brief and the roadmap and asks about gaps.
   Then ask only what the document leaves open among: platform and stack, data and hosting, test runner. No
   document → grill once, each question with your recommendation: what it does and for whom; platform and stack;
   data and hosting, if any; test runner; write the answers into `docs/product/brief.md`. Use `context7` to confirm
   the current setup commands for the chosen stack.
2. Fill `AGENTS.md` (first line, Map with the planned folders, Commands marked "after scaffold"), the
   `openspec/config.yaml` context and the `run-app` skeleton.
3. The first change is the scaffold itself: `/sdd add-project-skeleton`, tier M — a thin end-to-end slice: the app
   starts, one real screen or endpoint, one passing test, typecheck, lint and format scripts (intake already put it
   first on the roadmap). When it is done, fill `.claude/sdd.json`, the tool ignores and `docs/architecture.md` (step 3),
   set `stopGate`, run steps 5–7, tick it on the roadmap and move to the next item.
