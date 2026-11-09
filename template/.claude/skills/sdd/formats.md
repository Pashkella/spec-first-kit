# Artifact formats

Short artifacts are cheaper to write, review and keep true. Limits are ceilings, not targets.
Prose language comes from `openspec/config.yaml` (English unless the project chose another). OpenSpec headings,
SHALL/MUST, WHEN/THEN/AND, identifiers and paths always stay in English. The examples below are in English; write
the prose in the configured language.

## proposal.md — at most ~20 lines

```md
# <change-name>

Tier: M

## Why
<1–2 sentences: the problem and who has it.>

## What Changes
- <observable change>
- **BREAKING** <only if something breaks>
- Out of scope: <what this change deliberately does not do>

## Capabilities
- New: `<capability>` — <one line>
- Modified: `<existing/path>` — <which requirement changes>

## Impact
- <code areas · new dependency · data or migration · risk — only lines that are not empty>

## Assumptions
- <minor decision taken without asking; `Ruling: … — why` lines go here too>
```

## Delta spec — `specs/<capability>/spec.md`

- A capability is a durable behavior area (`checkout`, `user-auth`), not the name of the task.
- One requirement = one behavior: one sentence with SHALL or MUST, about 200 characters at most.
- 1–3 scenarios per requirement: the main path plus the error or edge case that matters. One line per WHEN and THEN,
  at most two AND lines.
- Only what a user, caller or other system can observe. No class names, libraries or steps.
- Do not specify framework defaults or obvious validation. No near-duplicate scenarios: one scenario with a list
  ("empty, longer than 80 characters, or only spaces") instead of three.
- New capability: start with `## Purpose`, one sentence of at least 50 characters. Existing capability: no Purpose.
- MODIFIED: copy the whole existing requirement block (header, the comment lines under it, every scenario), then
  edit it. Drop an `uncertain` comment only when this change settles it. New behavior that leaves the old one intact
  is ADDED, not MODIFIED.
- Scenario titles: at least two words, unique within the capability. Tests are named after them, and
  `.claude/skills/sdd/scripts/trace.mjs` matches tests to scenarios by title.
- A requirement taken from a product document gets `<!-- source: <path>#<section> -->` on the line right under its
  header (comments elsewhere are dropped on archive).
- More than ~12 requirements in one capability → split the capability.

New capability:

```md
## Purpose
Lets a signed-in user download their orders as CSV to keep records outside the service.

## ADDED Requirements

### Requirement: Export orders to CSV
<!-- source: docs/product/sources/brief.md#exports -->
The system SHALL give a signed-in user their orders for a chosen period as a CSV file.

#### Scenario: Orders in the period
- **WHEN** the user picks a period that has orders and presses "Export"
- **THEN** a CSV downloads with one row per order and the columns date, number, total, status

#### Scenario: Empty period
- **WHEN** the chosen period has no orders
- **THEN** no file is created and "No orders in this period" is shown

### Requirement: Only own orders
The system MUST include only the requesting user's orders in an export.

#### Scenario: Another user's order in the request
- **WHEN** an export request contains the id of another user's order
- **THEN** the response is 403 and no file is created
```

Existing capability:

```md
## MODIFIED Requirements

### Requirement: Export orders to CSV
<the whole existing block, edited>

## REMOVED Requirements

### Requirement: Export to XLS
**Reason**: replaced by CSV export
**Migration**: use "Export" → CSV
```

## design.md — tier L only, at most ~40 lines

```md
## Decisions
- <decision> — <why> — rejected: <alternative>   (only for non-obvious choices)

## Files
- `path/or/module` — what changes

## Test seams
- <public interface the tests go through> — catches <…> / misses <…>

## Risks
- <risk> → <mitigation>

## Migration / rollback
- <only when data or a public contract changes>
```

Do not restate the proposal or the specs; point to them. A spike behind the decision: link its note.

## tasks.md

```md
## 1. <area>
- [ ] 1.1 <verb + what> (Req: <requirement name>) — verify: <test file or command>
- [ ] 1.2 …
```

- Tests live in the group that builds the behavior. No trailing "write tests" group.
- `verify:` names a real test file or command; a scenario that can only be checked by eye says `verify: run-app — <what to look at>`.
- Each task fits one session. M: usually one group, up to ~8 tasks. L: one group per area, groups touch disjoint files.
- More than ~15 tasks or ~500 changed lines → split the change.
