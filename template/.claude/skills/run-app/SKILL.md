---
name: run-app
description: Recipe to install, start and smoke-check this application locally. Use to see a change working in the running app, and before reporting UI or API work as done.
---

# Run the app

Filled by `/onboard` and proven by starting the app once. Keep it current when the recipe changes.
Reading the code is not verification.

## Prerequisites
- <runtime and version, package manager, env vars (names only, from .env.example), services such as a database>

## Start
```bash
<install command>
<start command>   # long-running: run it in the background and stop it when done
```
<URL or port, and what "ready" looks like>

## Smoke check
- <the fastest proof it works: a URL that renders, an endpoint that answers, a log line>
- UI change: open the affected screen, take a screenshot, check the scenario's THEN.
- API change: call the endpoint with the scenario's input and compare the response with its THEN.
- <expected noise: warnings or console errors that are normal here>

## Stop
<how to stop the server; how to reset local data if a check needs a clean state>
