# Architecture

Read before changing a module's internals or adding one. Describe what the code does now; plans go in OpenSpec changes.

## Layers
<Which layer may import which, and how it is enforced (lint rule, structural test).>

## Modules
| Module | Owns | Entry point |
| --- | --- | --- |
| <name> | <responsibility> | `<path>` |

## Extension recipes
- **Add a <thing>:** <the 3–5 steps and files, so an agent copies the pattern instead of inventing one>
