# A bot can use Aven's API as the person

Status: accepted. Adds to 0059, 0085, 0086 and 0088, which gave a bot one tool per capability.

## Context

A bot could manage threads, goals, schedules, providers, MCP servers, notes and other bots, and nothing else of what a person does in the app: import a project, look at or update a runner, read a thread's diff, ship, organize folders, change settings. A tool per feature will always be behind the app. A person wants a bot that can do whatever they can.

## Decision

- **Two tools**, `aven_api_search` and `aven_api`. A bot looks a route up (method, path, a tier and the shape of its body, built from the server's own route table and its zod schemas, so there is no OpenAPI dependency and no second list to keep) and then calls it. Dedicated tools stay where they are more precise.
- **The call is made as the person, inside the control plane**, not through the network and not with a login. The runner sends `bot.api` over its existing connection; the control plane makes a one-reply grant (`grantActing`, kept in memory, never shown to the model), runs the request through the app with it, and ends the grant. `sessionOf` accepts the grant as a session for that user and workspace, so every route checks what it checks for the person: membership, ownership of a thread or a host runner. The grant lasts for one call.
- **Three tiers** (`gate.ts`):
  - A GET is a _read_: always allowed, with fields named like a key, token, secret or password hidden in the answer.
  - Any other method is a _change_: only on the person's own message (`makesBotsOnTheirWord`, as `start_thread` and `add_provider`), never on a note, a schedule, another bot or a thread's words, and never with a secret in the body.
  - A DELETE, shipping a thread and updating a runner are _confirm_: also need `confirmed: true`, which the tool tells the bot to set only after the person said yes to `ask_question`.
- **Blocked**: sign-in (`/auth`), platform administration, a runner's gateway and connection, the workload identity token, the GitHub sign-in flow, streams and terminals, binary files, making or rotating a runner's token, and setting a variable's value or the decision model's key. A secret goes through a form the person types into, as 0086 does for a provider key.
- **The path is judged as it will be routed**: decoded, dots resolved, any letter case, and what is sent is that same path, so an encoded `/%61uth` is not a way round the list.
- **Bounds**: 60 calls a reply, 30 seconds a call, 20,000 characters back. A person in more than one workspace names which (`organizationId`); a workspace they are not in is refused.

## Limits

- `confirmed: true` is a flag the model sets, so it protects against a bot acting without asking, not against a bot that has been talked into lying. A hard check would have the control plane see the person's yes in the chat; it does not yet.
- A change made through a route the app's page also protects with a confirmation dialog (that is client-side) is not asked twice.
- Streams (a thread's events) are not available: a bot reads a thread with `get_thread`.
- A call cut off at 30 seconds is not cancelled: the route may still finish, and the bot is told so. A field is a secret by any part of its name (`accessToken`, `clientSecret`), and a name and value pair by its name (`Authorization`), but a number or a `…Hint` is not.
- An older runner has no `aven_api`; it gets the tool when it updates.
