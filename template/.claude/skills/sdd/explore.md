# Spike: try before you commit

A spike answers one question cheaply: "which approach?", "does this library do X?", "what does it look like?".
Its output is knowledge, not code. Nothing from a spike merges.

## 1. Frame (one message)

- The question, in one sentence, and what answer would change the plan.
- Options to try (2–3 at most) and how each will be judged: a screenshot to compare, a number to measure, a
  command that works or not.
- Timebox: default one session. Ask only if the question itself is unclear.

## 2. Look outside first, when it helps

Prior art is cheaper than code: how competitors or well-known products solve it, library docs (`context7`), an
existing example in this repo. Summarize in 5–10 lines with links; do not paste pages.

## 3. Build throwaway

- `git switch -c spike/<name>`. Hardcode, skip tests, ignore layering: speed over quality. The stop gate does not
  run on `spike/` branches.
- UI question: a visual prototype the user can open (a story, a static page, a route behind a flag) and screenshots
  via `run-app`. The user judges what they see, not your description.
- Measure what the question needs (timings, bundle size, FPS) with the same method for every option.

## 4. Report and stop

Write `docs/spikes/<YYYY-MM-DD>-<name>.md` (under ~40 lines): Question · Options tried · Evidence (numbers, screenshot
paths, links) · Recommendation · What it means for the spec (behaviors worth specifying, risks). Show it and stop.

Next step is the user's: drop it, run another spike, or start `/sdd <change>` (usually M or L). The real change
starts from the default branch; carry over only the decision and the evidence, never the spike code as-is. Point
`design.md` to the spike note. Delete the spike branch once the change is planned.
