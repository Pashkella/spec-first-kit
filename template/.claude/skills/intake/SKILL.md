---
name: intake
description: Turn a product document (an idea write-up, PRD, spec or feature brief, in any language) into a product brief, a capability map, a roadmap of OpenSpec changes and the first change ready for approval, asking about gaps on the way. Use when the user gives a document to build from, during /onboard of a new project, or types /intake.
argument-hint: "<path to the document>"
---

# Intake

A product document is a source, not a spec. Specs in `openspec/specs/` describe what the system does now, so nothing
the document describes becomes a spec until a change that builds it is archived. Intake turns the document into
things the flow can act on, and keeps every requirement traceable to the section it came from.

## 1. Preserve the source

- Copy the document unchanged to `docs/product/sources/<slug>.md` if it lives elsewhere, with the images and files
  it links at the same relative paths (`setup.mjs --from` already does both and warns about links outside the
  document's folder). Never edit it later: it is the record. A newer version gets a new file and a line in the
  brief saying which one is current.
- Read all of it. A long document: list its headings with line ranges first, then read section by section and take
  short notes per section. Anchors used below are `docs/product/sources/<slug>.md#<heading-slug>`.

## 2. Extract

Write in the spec language from `openspec/config.yaml` (default English), whatever language the source is in.

- `docs/product/brief.md`: what and for whom, goals (with numbers where the source has them), not doing,
  constraints, decisions already made. Each point ends with its source anchor in parentheses. Under a page.
- Stack, architecture and tooling hints (languages, hosting, libraries the source names): keep them for `/onboard`
  (AGENTS.md Map and Commands, the `openspec/config.yaml` context). Do not decide the stack here.
- Capabilities: group the behaviors into durable areas (`user-auth`, `floor-plan-editor`, not task names), each
  with a one-line purpose and the titles of the requirements it will hold, one line each with its anchor. More than
  ~12 requirements in one area → split it.

## 3. Find the gaps, then ask

Check each capability for: who can do it (roles, permissions); the main path; error, empty and limit states; data
and its lifecycle (create, change, delete, retention); numbers (sizes, limits, performance); integrations;
non-functional needs (security, privacy, offline, i18n, accessibility); how acceptance is checked. Note sections
that contradict each other.

Ask one round: at most ~10 numbered questions, highest impact first, each with your recommended answer, so the user
can reply "ok" or "3: no, …". "grill me" or a vague source → one question at a time until every branch that changes
behavior is resolved. Write the answers into the brief under Decisions; what stays open goes under Open questions,
and the roadmap items it blocks say `blocked: Q<n>`.

## 4. Plan the order

Write `docs/product/roadmap.md`:

```md
# Roadmap

Source: docs/product/sources/<slug>.md · Updated: <YYYY-MM-DD>

## Capabilities
### <capability>
<one-line purpose>
- <requirement title> (<anchor>)

## Changes
- [ ] add-project-skeleton — app starts, one real screen or endpoint, one test, checks wired (new project only)
- [ ] add-<capability-or-slice> — <one line> · capabilities: <names> · after: <change> · tier: M
```

Order by dependency and by value: a thin end-to-end slice first, then one change per slice a user can see. Tick an
item when its change is archived. Keep the list honest: delete or rewrite items that no longer make sense.

## 5. Draft only the next change

Run the `sdd` planning steps (flow.md "Plan") for the first item, or the first two when the skeleton is trivial:
proposal, delta specs taken from the document with a `<!-- source: … -->` line under each requirement header, tasks;
`openspec validate --strict`. Stop there for approval. Do not draft the whole roadmap as changes: plans written weeks
ahead go stale and turn into documentation nobody trusts. Each later item becomes a change when `/sdd` picks it up.

Existing codebase: map each capability onto `openspec/specs/` first. Behavior that exists becomes MODIFIED against
the current spec; new behavior is ADDED. A capability of the next change with no spec gets a baseline from
`spec-miner` as in flow.md step 1 (branch first, baseline shown at the stop); later items get theirs when `/sdd`
picks them up. Append to the roadmap instead of replacing it.

## 6. Report

Files written, questions answered, questions still open, the first change awaiting approval, and the next step
(`/sdd <first change>` after approval, or `/onboard` if the project is not configured yet).
