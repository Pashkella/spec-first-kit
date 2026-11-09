# spec-first-kit

A spec-driven development kit for Claude Code and Codex. It puts an OpenSpec workflow, three subagents, a handful of
skills and a few hooks into your repository, where they are versioned and reviewed like the rest of the code. You
write the setup once in `.claude/` for Claude Code; if anyone uses Codex, the kit generates the Codex version from it.

Spec-first for substantial changes; test-first for small behavior fixes when a test can express the change. Unclear
approaches can start with a throwaway spike. For M and L changes, you approve a short plan before implementation.
Checks run after the change, with a reviewer agent for L and riskier M work. Repeated mistakes become durable
checks, rules or notes.

## What it installs

Everything lives in the places Claude Code already reads; there is no kit folder of its own.

```text
AGENTS.md                    instructions for every agent (filled by /onboard); CLAUDE.md imports it
openspec/config.yaml         project context, spec language, artifact limits
openspec/specs/, changes/    how the system behaves now, and changes in progress
docs/product/                brief.md; intake adds roadmap.md, and provided product documents go in sources/
docs/architecture.md         layers, modules, extension recipes
docs/solutions/              lessons from solved problems
.claude/
  settings.json              permissions and hook wiring
  sdd.json                   project settings: commands, stop gate, formatter, guard rules, packages, codex
  sdd.lock.json              generated: kit version and the hash of every file the kit wrote
  hooks/                     session-start, guard, post-edit, stop-gate, spec-only (+ protect with Codex)
  agents/                    implementer (Opus, test-first), reviewer (read-only), spec-miner
  skills/sdd/                the orchestrator: tiers Spike, S, M and L; scripts/ trace.mjs, snapshot.mjs
  skills/onboard/            one-time setup; scripts/ doctor.mjs, sync.mjs
  skills/intake/             product document → brief, roadmap, first change
  skills/run-app/            how to start and smoke-check the app (filled by /onboard)
  skills/compound-learning/  turns a lesson into a check, a hook, a rule or a note
  skills/diagnosing-bugs/, handoff/, context7/   from mattpocock/skills and upstash/context7 (MIT)
  rules/                     per-layer conventions with paths: frontmatter (written by /onboard)
  review-rules/              what the reviewer checks, one rule per file
  THIRD_PARTY.md             sources and license notices of the borrowed parts
.agents/skills/, .codex/     only with --codex: generated copies for Codex; do not edit them by hand
```

What an agent pays for in every session is `AGENTS.md` (about 50 lines before `/onboard` fills it) and one line per
skill and agent description. Skills, flows, agents and path rules load only when they are used; the scripts and hooks
are run, never read.

## Requirements

Node 20.12 or newer (OpenSpec itself needs 20.19+), git, and the OpenSpec CLI:
`npm install -g @fission-ai/openspec` (CI tests the kit with 1.16.1 and checks the latest release weekly). Claude
Code 2.1.277 or newer; Codex CLI if you install with `--codex`. Windows, macOS and Linux.

## Install

Run it with npx from GitHub, or clone the repository and run `node setup.mjs`. Both take the same arguments. Add
`--codex` when anyone works in the repository with Codex; you can also add it later.

New project:

```bash
npx github:Pashkella/spec-first-kit ~/code/my-app
cd ~/code/my-app && git init
claude        # then: /onboard
```

New project from a document you already wrote (an idea, a PRD, a spec, in any language):

```bash
npx github:Pashkella/spec-first-kit ~/code/my-app --from ~/notes/my-app.md
cd ~/code/my-app && git init
claude        # then: /onboard docs/product/sources/my-app.md
```

`/onboard` asks which language agents should talk to you in and which language specs should be written in
(English unless you pick another). With a document, it runs the `intake` skill. The document is kept unchanged in
`docs/product/sources/`, together with the images and files it links by a relative path. The agent writes a product
brief and a roadmap of changes, asks you about the gaps it found, and drafts the first change for your approval.
Requirements keep a link to the section they came from.

Existing project:

```bash
npx github:Pashkella/spec-first-kit ~/code/existing --dry-run   # see what it would do
npx github:Pashkella/spec-first-kit ~/code/existing
cd ~/code/existing && claude                                 # then: /onboard
```

An existing `AGENTS.md` or `CLAUDE.md` is renamed to `*.old.md`, and `/onboard` moves the rules that are still true
into the new `AGENTS.md`. An existing `.claude/settings.json` is merged, so your permissions and hooks stay.
`/onboard` runs each configured typecheck, lint, test and build command once (`doctor.mjs --full`), writes per-layer
rules from how the code actually looks, records a test baseline and picks the stop-gate mode. It keeps the project's
linter and formatter off the kit's files, and when committed code is not formatted yet it limits the formatter hook to
new files, so diffs stay free of unrelated lines. It does not write specs for code nobody is changing. Claude Code asks
before each edit in `.claude/`; answering "Yes, and allow Claude to edit files in this project's .claude folder for
this session" once covers the rest of onboarding.

With `--codex`, run `$onboard` in Codex instead if you prefer, then `/hooks` to trust the project hooks. Codex runs no
project hook until you do.

## Monorepos

Install the kit once, at the repository root, and run `/onboard` there: one `AGENTS.md`, one `openspec/`, one
`.claude/`. The commands in `.claude/sdd.json` cover the whole repository (`npm run test --workspaces --if-present`,
`turbo run test`), and the conventions of one package go into `.claude/rules/<package>.md` with
`paths: ["packages/<name>/**"]`, so they load only when an agent touches that package. OpenSpec stays one tree;
capability names carry the package (`api-orders`). Do not install the kit into each package: `setup.mjs` warns when
the target folder is inside a bigger git repository.

Claude Code reads `.claude/settings.json` only from the folder it starts in, so a session started in a package would
run none of the kit's hooks and none of its `Read` denies. List those folders under `packages` in `.claude/sdd.json`
(`"packages/*"` is every folder under `packages/`); `sync.mjs` gives each one a small generated `.claude/settings.json`
that runs the root hooks. A nested `AGENTS.md` needs a `CLAUDE.md` next to it with the line `@AGENTS.md`, because
Claude Code loads nested `CLAUDE.md` files, not nested `AGENTS.md`; `doctor.mjs` reports one that has none. Codex runs
the root hooks from any subfolder and reads `AGENTS.md` files from the root down to the folder it starts in.

## How a change goes

1. You type `/sdd add CSV export` (in Codex, `$sdd add CSV export`). The agent picks a tier and says why.
2. Spike: a throwaway branch to try an idea and show you screenshots or numbers. Nothing from it merges.
3. S: a small fix. The agent writes a failing test first when it can, fixes it and runs the checks.
4. M or L: the agent reads only the specs involved, asks a few questions with a recommended answer for each, then
   writes a proposal, delta specs and tasks and stops. You read about twenty lines of plan instead of the diff. In
   an existing codebase with no spec for the area, `spec-miner` first writes a baseline of how it works today, and
   you confirm it at the same stop.
5. After you approve, the agent or the `implementer` subagent builds it test-first, naming each test after its
   scenario. `trace.mjs` reports test files whose contents mention each scenario title; the `reviewer` checks that
   every scenario has code and a test that really asserts it. For L and risky M changes, the reviewer works from a
   snapshot of the working tree, since nothing is committed yet.
6. The agent runs the checks, archives the change so specs and code merge together, and leaves the commit to you.

Hooks run on each matching event, and they write nothing into the context unless they have something to say.
`guard` catches common destructive commands, commands that throw away uncommitted work, and commits that contain
secrets; it is a guardrail against slips, not a sandbox, so what must never happen also goes into `permissions.deny`.
Once configured by `/onboard`, `stop-gate` keeps the agent working while typecheck or tests fail and checks again after
each fix; when the retries run out, the turn ends with a warning that the check is still red, so it never loops. It
runs only when code changed since the last green check and stays out of `spike/` branches. `post-edit` runs the
configured formatter after each edit (only on new files with `formatScope: "new"`), and `session-start` tells a fresh
session in a few lines where the work stands.

Two Claude Code features complement the hooks, and `/onboard` offers both: the Bash sandbox (`/sandbox`), where the
operating system limits files and network for every shell command and the kit's deny rules hold for shell commands
too, and a language-server plugin, which shows the agent type errors right after each edit.

## Everyday commands

| Task | Claude Code | Codex |
| --- | --- | --- |
| Change behavior | `/sdd add CSV export` | `$sdd add CSV export` |
| Try an idea first | `/sdd try two layouts for the booth card` | `$sdd …` |
| Plan from a document | `/intake docs/prd/search.md` | `$intake docs/prd/search.md` |
| Hard bug | `/diagnosing-bugs` | `$diagnosing-bugs` |
| Record a lesson | `/compound-learning` | `$compound-learning` |
| Hand off a long session | `/handoff`, then `/clear` | `$handoff`, then a new session |
| Which scenarios have no test | `node .claude/skills/sdd/scripts/trace.mjs <change>` | same |
| Check the harness | `node .claude/skills/onboard/scripts/doctor.mjs [--full]` | same |
| After editing skills, agents, rules or settings | `node .claude/skills/onboard/scripts/sync.mjs` (with Codex or `packages`) | same |

`sync.mjs --check` exits with an error when a generated file is stale, which makes it a good CI step.

## Where a new rule goes

A check catches a mistake every time; a sentence in a prompt only works if the agent reads it at the right moment.
So prefer the first option that fits:

1. A lint rule, a type or a test whose error message tells the agent how to fix the problem.
2. For an action that must never happen: a `permissions.deny` entry in `.claude/settings.json` for a path, an entry
   in `guardRules` of `.claude/sdd.json` for a shell command.
3. A bullet in `.claude/rules/<layer>.md` for a convention of one part of the code.
4. A file in `.claude/review-rules/` for something only a reviewer can judge.
5. A note in `docs/solutions/` for a story the code cannot carry.
6. `AGENTS.md`, last, because every session pays for every line in it.

`/compound-learning` walks this list for you after a change.

## Updating

```bash
npx github:Pashkella/spec-first-kit <project> --update
```

`.claude/sdd.lock.json` records the hash of every file the kit wrote, so the kit knows which files are still its own.
`--update` replaces each kit file nobody changed here and deletes the unchanged ones a new version no longer ships
(a changed one stays, and the output says so). A file you changed stays as it is, and the kit's new version goes to
`.claude/.cache/kit-new/` so you can compare; a file you deleted (an empty docs template, say) stays deleted.
`--force` also replaces kit files you changed and brings back the ones you deleted, but never replaces the templates
`/onboard` fills (`AGENTS.md`, `CLAUDE.md`, `openspec/`, `docs/`, `implementer.md`, `run-app`, rules and review
rules). `settings.json` and `sdd.json` are merged: new keys arrive, your values stay. Old copies go to
`.claude/.cache/kit-backup/`. A plain run without `--update` only adds what is missing and lists what is outdated.

`--codex` and `--no-codex` switch Codex on or off at any time: the protect hook, its deny entries, the Codex block in
`AGENTS.md` and the generated copies come or go together.

`sync.mjs` keeps the hash of every file it generated in the same lock. It never replaces or deletes a file it did not
write (it reports a conflict; `--force` replaces the file and keeps a backup), and it backs up a copy that was edited
by hand before replacing it.

## Platforms

The installer and kit scripts are plain Node with no third-party runtime dependencies. Claude Code starts the hooks
as `node <script>` without a shell, so they behave the same on every system. For Codex the kit writes two commands
per hook: a POSIX one that finds the repository root with `git rev-parse`, and a `commandWindows` one that runs the
script through a one-off git alias, because git starts such aliases from the repository root on any shell. Hooks
answer with JSON decisions instead of exit code 2, since some Codex builds on Windows treat exit 2 as a hook failure
and let the command run.

`node test/selftest.mjs` installs the kit into temporary projects and runs every script the way both tools call
them, including updates and switching Codex on and off. CI runs it on Ubuntu, macOS and Windows with Node 20 and 22. It
feeds the hooks test input, so it cannot show that a real client loaded them: before a release, walk through
[test/MANUAL.md](test/MANUAL.md) in Claude Code and Codex.

## Claude Code and Codex

The source is `.claude/`; with `--codex`, Codex gets generated copies. Not everything carries over the same way:

| What | Claude Code | Codex |
| --- | --- | --- |
| Instructions | `AGENTS.md`, through `CLAUDE.md` | `AGENTS.md` files from the repo root down to the folder Codex starts in |
| Path rules | `.claude/rules/`, loaded when a matching file is touched | listed in the Codex block of `AGENTS.md`; the agent reads the rule before editing |
| Skills | `.claude/skills/` | `.agents/skills/` |
| Subagents | `.claude/agents/`, with model and effort | `.codex/agents/`: the same effort; the session model unless `codexModel:` is set |
| `guard` | Bash and PowerShell tools | shell commands |
| Edit denies in `permissions.deny` | enforced by Claude Code | the `protect` hook on `apply_patch` |
| Read denies (`.env`) | enforced by Claude Code | only `guard`'s rules for shell reads |
| Formatter after an edit | `post-edit` on Edit and Write | `post-edit` on `apply_patch` |
| `spec-miner` may write only specs | a hook scoped to that agent | an instruction only: Codex has no per-agent hooks |
| When hooks run | always | in a git repository, after you trust them with `/hooks` |
| Sandbox for shell commands | `/sandbox` (macOS, Linux, WSL2), offered by `/onboard` | Codex's own sandbox settings |
| Type errors right after an edit | a language-server plugin, offered by `/onboard` | none: the stop gate catches them |

Agent teams in Claude Code are still experimental and cost a lot more tokens; the kit does not turn them on.

## Credits and license

MIT, see [LICENSE](LICENSE). The kit first took shape in a real project and borrows from mattpocock/skills,
upstash/context7, karpathy-guidelines, ECC, HumanLayer and Compound Engineering; details and license notices are in
[template/.claude/THIRD_PARTY.md](template/.claude/THIRD_PARTY.md).
