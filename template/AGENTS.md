# AGENTS.md — <project name>

<One sentence: what this project is and for whom.>

## Map

| Path | Purpose |
| --- | --- |
| `<src/…>` | <what lives here; "read before …" when a doc must be read first> |
| `docs/product/brief.md` | What we build and for whom. Read when scope is unclear |
| `docs/architecture.md` | Layers, modules, extension recipes. Read before changing a module's internals |
| `openspec/specs/` | How the system behaves now. Read the relevant spec before changing behavior |
| `docs/solutions/` | Non-obvious lessons from solved problems. Search here before debugging |

## Commands

- Install: `<…>`
- Typecheck: `<…>`
- Lint: `<…>`
- Tests: `<…>`; one file: `<…>`
- Build: `<…>`
- Run the app: `run-app` skill

## Workflow

Every behavior change goes through the `sdd` skill (`/sdd <what>`): it picks a tier (Spike, S, M or L) and decides
when to use the `implementer`, `reviewer` and `spec-miner` agents. A product document to plan from → `intake <file>`.
Long context → suggest `/handoff` or `/clear`; the session-start hook restores where work stands.

## Conventions

- Talk to the owner in <language>. Code, comments and commit messages in English.
- <Only non-obvious, repo-specific rules: what a strong engineer new to this repo would get wrong. No style rules a
  linter or formatter already enforces.>
- Reuse before writing: an existing helper, pattern or neighbor test. Unrelated problems go to "Noticed, not touched".
- Grep lockfiles, build output and generated files; never read them whole.
- Unsure about a library API for the version in use → `context7`, not memory.

## Done means verified

Before saying "done", "fixed" or "passing": run typecheck, lint, tests and build and quote their result lines.
Do not re-run a check that already passed with no code change since. User-visible change → check it live with
`run-app`. If a check cannot run here, say which and why.

## Never

- Push, merge, publish, deploy, or touch production and external accounts without an explicit request in chat.
- Put secrets in code, commands, specs, logs or commits.
- Weaken, skip or delete a test to make it pass; filter output to hide failures.
- Edit `openspec/changes/archive/` or generated files (`<dist/…>`).
