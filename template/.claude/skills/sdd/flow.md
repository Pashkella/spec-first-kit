# SDD flow for tiers M and L

Project context and artifact rules: `openspec/config.yaml`. Formats and limits: [formats.md](formats.md).

## 1. Understand (cheap first)

- `openspec list`: continue a matching in-flight change instead of starting a new one.
- `openspec list --specs`, then read only the specs this change touches; grep `docs/solutions/` and `docs/spikes/`
  for the area.
- Unfamiliar area in a large repo: 1–2 read-only explore subagents with narrow questions (they return file lists and
  conclusions, not file dumps). Small repo: search and read the relevant parts yourself.
- The change modifies an existing capability with no spec → a baseline first: without one, a MODIFIED delta passes
  `validate` but `openspec archive` refuses it at the very end. Create the change branch now (step 3, first bullet)
  so the baseline lands on it, then dispatch `spec-miner` for that capability only, with its entry points. Check two
  or three of its requirements against the `code:` anchors yourself. The user sees the baseline at the STOP in step
  3; suspected bugs from its report are questions for step 2, not requirements. Never mine specs for code you are not
  changing. A baseline stays in `openspec/specs/` even if the change is dropped: it describes the code as it is.

## 2. Clarify (one round, two at most)

Ask only what changes behavior, scope or data: numbered questions, each with your recommended answer,
so the user can reply "ok" or "2: no". Look facts up yourself. Minor details: decide and record them as Assumptions.
The user says "grill me", or the goal itself is fuzzy → ask one question at a time, each with a recommendation,
until every branch that changes behavior is resolved; then summarize the decisions in 5 lines.

## 3. Plan

- On the default branch: `git switch -c <change-name>` (kebab-case, verb first: `add-…`, `fix-…`, `change-…`).
- `openspec new change <change-name>`, then write proposal → delta specs → design (L only) → tasks.
- `openspec validate <change-name> --strict` until clean. Treat its `Archive would refuse this delta` note as an
  error: a MODIFIED or RENAMED delta needs the requirement in `openspec/specs/` (a baseline, step 1).
- **STOP.** Show: tier, Why in one line, requirement and scenario titles, task list, assumptions. With a new
  baseline, also its requirement titles, its `uncertain` notes and the requirements with no test anchor, and ask
  whether it describes today's behavior. Wait for approval. Plan edits after that: change the artifacts,
  re-validate, show only what changed.

## 4. Build

For M, implement directly when the change is one small task group and at most about three code/test files. Dispatch
`implementer` when the work spans more files, has separable task groups, or benefits from a fresh context. For L,
one implementer per group. Model and effort live in each agent's frontmatter; by default the reviewer runs a
different model than the implementer, so the review is not the author grading itself. Raise effort only when the
approach is unclear or the change is unusually complex.

Keep the delegation prompt to the change name, scope (`all` for M, a group number for L), and any decision not
recorded in the artifacts. Do not paste artifact content; the agent reads the proposal, specs and tasks directly.

- L: one group at a time, in dependency order, all in this working tree. Not in parallel: a parallel implementer
  needs its own git worktree, a worktree starts from HEAD, and with no commits it would see neither the plan nor the
  groups done before it.
- Read the report and use its command evidence. Do not repeat a passing check unless code changes afterward.
- `node .claude/skills/sdd/scripts/trace.mjs <change-name>` after the last group (and after a direct M build): a `missing` or
  `anchored` scenario goes back to the implementer before review (after a direct build, resolve it yourself). An
  `anchored` one only has its requirement's test file: find the test there that asserts the scenario's THEN and put
  the scenario title in a comment above it, or write the test. A scenario that cannot have an automated test gets
  `<!-- manual: why, how it was checked -->` on the line under its `#### Scenario:` header, and the user hears why.
- BLOCKED on a question → answer it (ask the user if it is a product decision), update the artifacts, then continue
  the same implementer (SendMessage, or a follow-up in its agent thread): it keeps its context.
- Leave commits to the user.

## 5. Review

Dispatch `reviewer` for every L change and for M changes that cross modules, alter data/API contracts, or touch
security-sensitive behavior. For a small single-area M, review the diff and scenarios yourself (the trace output,
`git status`, and `git diff` plus the new files). Pass: change name, base (`node .claude/skills/sdd/scripts/snapshot.mjs --base`),
and `security: yes` when the diff touches auth, permissions, payments, uploads, outbound requests, secrets or
rendering of user content.

- Check each finding against the code before acting; reject wrong ones with a one-line reason. No performative agreement.
- A fix the finding spells out and that touches a few lines in one file: apply it yourself and run its test.
  Everything else, and FAIL/MISSING scenarios: send to the same implementer.
- Before the first fix, run `node .claude/skills/sdd/scripts/snapshot.mjs` and keep the id: there is no commit to diff from.
  Re-review only the fix: `reviewer` with `since: <that id>` and the open findings. Two rounds at most, then show the
  user what is still open.

## 6. Finish

- Verify (AGENTS.md "Done means verified"). Run only what has not passed since the last code change — usually lint,
  the full suite if shared code changed, and `run-app` for user-visible behavior.
- Archive on the branch so code and specs merge together: `openspec archive <change-name> --yes`.
  If a delta REMOVES or RENAMES a requirement, tell the user first. The change is on `docs/product/roadmap.md` →
  tick it there, and fix the next items if this change made them wrong.
- Do not commit automatically; leave the branch and archive state ready for the user. Offer push and PR only when asked.
- Flywheel: a correction the user had to make, a review finding that will recur, or a non-obvious lesson →
  `compound-learning`. It picks the cheapest durable home (a check beats a rule, a rule beats a note).
- Suggest `/clear` before the next change: this change is in git and the specs. Stopping mid-change → `/handoff`.

## Stop and ask only when

An action is irreversible or external (production, payments, accounts, data deletion); the spec and the user's
latest words disagree; every option is a guess. Otherwise decide, record `Ruling: <decision> — <why>` in the
proposal's Assumptions, and continue.
