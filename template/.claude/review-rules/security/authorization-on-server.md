# Authorization is checked on the server

Risk: a handler trusts a client-provided id or a hidden UI control, so any logged-in user can read or change another user's data.

Flag when:
- A handler loads or mutates a record by id without checking that the current user owns it or has a role that allows it.
- Permission checks exist only in UI code.

Do not flag when:
- The query itself is scoped by the current user id (`where: { userId: session.userId, id }`).

Bad: `const doc = await db.doc.findUnique({ where: { id: input.id } })`
Good: `const doc = await db.doc.findFirst({ where: { id: input.id, ownerId: session.userId } })`
