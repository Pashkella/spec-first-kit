# Release check in the real clients

`node test/selftest.mjs` runs the hook scripts with test input. It cannot show that Claude Code or Codex loaded the
hooks, asked for trust and sent the events the scripts expect. Before tagging a release, install the kit into two
throwaway repos (an empty one with `--codex`, and a copy of a real project without it) and check each row once.
About 25 minutes.

| # | Client and shell | Do | Expect |
| --- | --- | --- | --- |
| 1 | Claude Code, Bash | ask the agent to run `git reset --hard` | denied by `guard.mjs` |
| 2 | Claude Code, PowerShell tool (Windows) | ask it to run `Remove-Item -Recurse -Force .` | denied by `guard.mjs` |
| 3 | Claude Code | ask it to edit a file in `openspec/changes/archive/` | refused by `permissions.deny` |
| 4 | Claude Code | set `stopGate: "typecheck"` in `.claude/sdd.json`, break a type, let it stop | blocked once; after its fix the check runs again |
| 5 | Claude Code | `/sdd` on a small change | the skill loads; `trace.mjs` and `snapshot.mjs` run without a permission prompt |
| 6 | Claude Code, monorepo | list a package under `packages`, run `sync.mjs`, start Claude Code in that package, ask for `git reset --hard` | denied: the package stub runs the root guard |
| 7 | Codex, macOS or Linux | trust the hooks with `/hooks`, ask it to run `git reset --hard` | denied by `guard.mjs` |
| 8 | Codex, Windows | the same, started from a subfolder of the repo | denied: `commandWindows` found the repo root |
| 9 | Codex | ask it to edit `.codex/hooks.json` | denied by `protect.mjs` |
| 10 | Codex | set `format` in `.claude/sdd.json`, let it edit a file | the formatter ran on that file |
| 11 | Codex | add a path rule, run `sync.mjs`, start a new session, ask it to edit a matching file | it reads the rule first |
| 12 | Both | `node .claude/skills/onboard/scripts/doctor.mjs --full` | no FAIL; timings for every command that is set |
| 13 | Installer | install the previous release into a copy of a real project, run `/onboard`, then `setup.mjs --update` from this one | filled files kept, values kept in `sdd.json`, doctor without FAIL |

Write down the client versions next to the release. A row that fails is a kit bug: fix it, or record it under
"Claude Code and Codex" in the README.
