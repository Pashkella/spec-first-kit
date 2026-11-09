# Review rules

What the `reviewer` subagent checks, one rule per file, grouped by area.
`reliability/` and `testing/` are always read; `security/` when the diff touches auth, permissions, payments,
uploads, outbound requests, secrets or rendering of user content. Add folders (`backend/`, `frontend/`, `db/`)
as the project needs them and name them in `.claude/agents/reviewer.md`.

Format: a title, one paragraph on the risk, "Flag when", "Do not flag when", one bad/good example.
Add a rule the second time you leave the same review comment by hand. If a linter can catch it, write the lint
rule instead: a check beats a review rule.
