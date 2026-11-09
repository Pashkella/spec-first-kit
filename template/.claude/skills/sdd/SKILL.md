---
name: sdd
description: Spec-driven workflow for behavior changes - picks a tier (Spike/S/M/L), writes compact OpenSpec artifacts, gets approval, delegates when useful, verifies proportionally, and archives. Use when the user asks to add, change or fix behavior, wants to try an idea before committing to it, or types /sdd.
argument-hint: "<what to build, change, fix or try>"
---

# SDD

You are the orchestrator: you talk to the user, write the plan, delegate the code, check evidence, integrate.

Claude Code loads the kit's hooks and permission rules only from `.claude/settings.json` in the folder it started in.
If the working directory is a subfolder of the one that holds this skill's `.claude/` and has no `.claude/settings.json`,
tell the user once that guard and the stop gate are off in this session: start Claude Code from the repository root,
or list the folder under `packages` in `.claude/sdd.json` and run `node .claude/skills/onboard/scripts/sync.mjs`.

## Pick the tier

| Tier | When | Artifacts | Code by |
| --- | --- | --- | --- |
| Spike | Approach or result unclear; the user wants to see it before deciding; a library or UX idea to try | findings note, no specs | you, throwaway branch |
| S | Fix or tweak with obvious behavior, ≤ ~3 files, no new dependency, no schema or data change | none; edit a spec line in place if a described behavior changes | you |
| M | New or changed behavior in one area | proposal, delta spec(s), tasks | you or `implementer`, by scope |
| L | Cross-cutting; new dependency; data migration; auth, payments, permissions or personal data; public API contract | + design.md, task groups | `implementer` per group |

No argument and `docs/product/roadmap.md` exists → offer its first unticked item. A whole product document instead
of one change → `intake` first.

Tell the user the tier and a one-line reason. Between two tiers pick the lower and escalate if the work grows.
Pure refactor or tooling: S, or M/L with `skip_specs: true` in the change's `.openspec.yaml`.

- **Spike → read [explore.md](explore.md) now.**
- **M or L → read [flow.md](flow.md) now and follow it.** Artifact formats: [formats.md](formats.md), read it when
  you write the artifacts.

## S — quick path

1. `openspec list --specs`, read only the spec this fix touches. If the fix changes a described behavior, edit that
   requirement or scenario in place.
2. Bug: reproduce it with a failing test when a seam exists. Cause not obvious after one look → `diagnosing-bugs`.
3. Fix and verify (AGENTS.md "Done means verified"). Leave commits to the user.
4. Risky area (auth, payments, permissions, user-content rendering) → dispatch `reviewer` with change `none`.

Touching more than ~3 files or inventing behavior → stop, switch to M.
