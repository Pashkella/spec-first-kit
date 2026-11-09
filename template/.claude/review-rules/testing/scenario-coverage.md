# Every changed scenario has a real test

Risk: a requirement changes but no test asserts the new THEN, so a later change silently breaks it.

Flag when:
- A delta spec adds or modifies a scenario and no test name or assertion matches it.
- A test only asserts "does not throw" or uses a snapshot without checking the scenario's THEN.
- A test was deleted, skipped (`.skip`, `xit`) or its assertion weakened in this diff.

Do not flag when:
- The scenario is explicitly marked as manually verified in the spec.
