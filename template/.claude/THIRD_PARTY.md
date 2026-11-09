# Where the parts come from

| What | Source | License |
| --- | --- | --- |
| `skills/diagnosing-bugs/`, `skills/handoff/` (copied unchanged, without `agents/openai.yaml`) | [mattpocock/skills @ 5beb35b](https://github.com/mattpocock/skills) (`skills/engineering/diagnosing-bugs`, `skills/productivity/handoff`) | MIT, notice below |
| `skills/context7/` (rewritten and shortened from `skills/find-docs`) | [upstash/context7 @ eabe369](https://github.com/upstash/context7) | MIT, notice below |
| Working rules in the Conventions of `AGENTS.md` (condensed) | [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | MIT |
| Review gate in `agents/reviewer.md`, `review-rules/reliability/no-silent-failures.md`, secret patterns in `hooks/guard.mjs`, sample-and-expand budget in `agents/spec-miner.md` | ideas from [affaan-m/ECC](https://github.com/affaan-m/ECC) | MIT |
| "Look for" list and full-function reading in `agents/reviewer.md` | ideas from [vercel-labs/open-agents](https://github.com/vercel-labs/open-agents) (`.agents/skills/code-review`) | MIT |
| Stop-gate pattern in `hooks/stop-gate.mjs` | idea from [humanlayer/humanlayer](https://github.com/humanlayer/humanlayer) | Apache-2.0 |
| `docs/solutions/` and the compound step | idea from [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) | MIT |
| Everything else: SDD orchestrator, intake, agents, hooks, scripts | [Pashkella/spec-first-kit](https://github.com/Pashkella/spec-first-kit), first built in `expofp/efp3d-sandbox` | MIT |

To update a copied skill, copy the new upstream version over its folder, review the diff, and change the commit in
this table. Adapt copied skills in project files, not in the copies.

## License notices

`skills/diagnosing-bugs/` and `skills/handoff/`: Copyright (c) 2026 Matt Pocock.
`skills/context7/`: Copyright (c) 2021 Upstash, Inc.

Both are published under the MIT License:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
