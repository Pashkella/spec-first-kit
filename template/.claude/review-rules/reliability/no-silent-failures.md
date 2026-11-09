# Errors are not swallowed

Risk: a failure turns into an empty value or a log line, the caller carries on, and the bug shows up far away,
with no trace. Agents produce this pattern often because it makes tests and demos pass.

Flag when:
- A `catch` is empty, only logs, or returns `null`, `[]`, `{}` or a default without the caller being able to tell it failed.
- `.catch(() => ...)` or `?? default` hides a failed request, query or parse.
- An error is rethrown without its cause (lost stack, generic message).
- A network, file or DB call on a user-facing path has no timeout or error path; multi-step writes have no rollback.
- A log line on failure has no context to diagnose it (which id, which input).

Do not flag when:
- The fallback is the specified behavior (a WHEN/THEN scenario says so) and is visible to the caller or the user.
- A framework-level handler upstream (error middleware, error boundary, top-level job handler) handles it.
- The call is deliberately fire-and-forget (metrics, logging) and marked as such (`void`, a comment).

Bad: `try { return await api.get(id) } catch { return null }`
Good: `try { return await api.get(id) } catch (e) { throw new FetchError(`get ${id}`, { cause: e }) }`
