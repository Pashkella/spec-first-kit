---
name: context7
description: Fetch current documentation for a library, framework, SDK or CLI through Context7 (the ctx7 CLI). Use before writing or fixing code against an API you are not certain about for the version this project uses - a new dependency, a recent major version, config options, a migration, or an error that suggests an API mismatch. Not for the project's own code or language basics.
---

# Context7 docs

Based on Context7's official `find-docs` skill (Upstash, MIT). Uses the CLI, so no MCP server is needed. The CLI
version is pinned because `.claude/settings.json` runs it without a prompt; to move to a newer one, change the version
here and in both `ctx7` entries of `permissions.allow`.

## 1. Version first

Get the installed version without reading a lockfile whole: the manifest (`package.json`, `pyproject.toml`,
`go.mod`) or a targeted query (`npm ls <pkg> --depth=0`, `grep -m1 -A2 '"node_modules/<pkg>"' package-lock.json`).
Docs for the wrong major version are worse than none.

## 2. Library ID

If `.claude/context7-ids.md` already lists the library, use that ID and skip to step 3. Otherwise:

```bash
npx -y ctx7@0.8.2 library "<Official Name>" "<what you need to know>"
```

Use the official spelling (`Next.js`, `Three.js`). Pick by: name match, official source over forks, higher
reputation and benchmark score, and a version-specific ID (`/org/project/vX.Y.Z`) close to the installed version.
Then add a line `<name> → </org/project>` to `.claude/context7-ids.md` (create it if missing), so the next lookup
skips this step. The list lives outside `AGENTS.md` because only a lookup needs it.

## 3. Query, one topic at a time

```bash
npx -y ctx7@0.8.2 docs </org/project[/version]> "<one specific question>" [--language <lang>]
```

- Good: `"useEffect cleanup with async operations"`. Bad: `"hooks"` (vague), `"routing and auth and caching"` (several
  topics — make one call per topic).
- At most 2 `docs` calls per question; then use the best result you have.
- Keep only the lines you need from the output (a signature, an option, one example) in your reasoning and code;
  do not paste whole responses into reports or files.
- Never put secrets, personal data or proprietary code into a query.

## Errors

Quota or rate-limit error: tell the user and suggest `npx -y ctx7@0.8.2 login` or a `CONTEXT7_API_KEY` env var.
If you then answer without Context7, say that the API details are unverified. Never fall back silently.
