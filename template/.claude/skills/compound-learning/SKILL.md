---
name: compound-learning
description: Turn a lesson from a solved, verified problem into the cheapest durable fix - a check, a hook, a path rule, a review rule, or a note in docs/solutions/. Use at the end of a change or bug fix, when the user corrected the agent, or when a review finding will recur.
argument-hint: "[short context]"
---

# Compound learning

Each lesson should make the next change easier. A mistake that happens twice is a harness bug, not a prompt problem.

## 1. Is there a lesson?

Write nothing if a future engineer reading the final code, tests or specs would not repeat the mistake or redo a
substantial investigation. Say so in one line and stop.

## 2. Pick the cheapest home that would have prevented it

Go down the list and stop at the first that fits. Higher is better: a check runs every time, a note only if read.

1. **A check** — a lint rule, a type, a structural or regression test whose failure message says how to fix it.
   Non-trivial or new dependency → propose it to the user instead of adding it.
2. **A deny or a hook rule** — an action that must never happen: a path → `permissions.deny` in
   `.claude/settings.json`; a shell command → an entry in `guardRules` of `.claude/sdd.json`.
3. **A path rule** — a convention for one layer: one bullet in `.claude/rules/<layer>.md` (create it with a
   `paths:` frontmatter if the layer has none; keep it ≤ ~15 bullets).
4. **A review rule** — something only judgment catches: `.claude/review-rules/<area>/<slug>.md`, in the format of the
   files there. Add one the second time the same review comment is made by hand.
5. **A note** — a non-obvious story (symptom → cause) that code cannot carry: `docs/solutions/<area>/<slug>.md`.
6. **AGENTS.md** — only if it matters in every session. Last resort: that file costs tokens in every session.

## 3. Write it, prune nearby

Search the target first and update an existing entry instead of adding a twin. While there, delete a line that is
obsolete or now enforced by a check. Edited skills, agents, rules or settings in `.claude/` →
`node .claude/skills/onboard/scripts/sync.mjs` (it regenerates what is derived from them; a no-op when nothing is).

Note format (under 30 lines, link files by path, no session narrative):

```md
---
title: <one line>
area: <auth | db | ui | build | …>
date: <YYYY-MM-DD>
change: <openspec change name, if any>
---

## Symptom
## Root cause
## Fix
## How to recognize it next time
```

Report in two lines: where the lesson went and why there.
