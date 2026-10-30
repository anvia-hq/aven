# Native client contract

Status: built. What a non-TypeScript client (the macOS app in `clients/macos`) needs to talk to the control plane. See decision 0008 for why. Everything here is JSON over HTTP; the run stream is server-sent events.

## Server and sign-in

The user enters the control plane's address (`BASE`, for example `https://aven.example.com`). Paths below are relative to it, with no `/api` prefix (that exists only in the web app's dev proxy).

1. `POST /auth/sign-up/email` `{ name, email, password }` or `POST /auth/sign-in/email` `{ email, password }`. A successful response carries the session token in the **`set-auth-token`** response header.
2. Send `Authorization: Bearer <token>` on every request after that. Keep the token in the Keychain.
3. A new session starts in the user's personal organization. `GET /auth/get-session` returns `{ session: { activeOrganizationId }, user }`; `POST /auth/organization/set-active` `{ organizationId }` switches it. All thread, project and runtime data is scoped to the active organization.
4. `401` means the token is gone: sign in again. Registration can be closed (`403`).

## Data

- `GET /projects` returns `[{ id, name, runtimeId, createdAt, updatedAt }]`. A project is a name and the runner that hosts its sandboxes.
- `POST /projects` `{ name, runtimeId }` creates one. `422` if the runner is not in the organization or is revoked. It need not be online.
- `GET /runtimes` returns `[{ id, name, online, ... }]` (the runners).
- `GET /threads` returns `[{ id, projectId, title, runtimeId, state, running, createdAt, updatedAt }]`, newest first.
- `POST /threads` `{ projectId, title? }` creates a thread, which gets its own sandbox with an empty workspace on first run. `422` if the project is not in the organization.
- `GET /threads/:id` returns the thread plus `running`, `awaitingAnswer` and `messages` (the transcript, see below).
- `POST /threads/:id/messages` `{ prompt, attachments?, providerId?, modelId?, reasoningEffort? }` starts a run and returns `202`. `attachments` is up to 10 files `{ name, mediaType?, data }` with `data` in base64, at most 10 MB together; `prompt` may be empty when there are files. Every file is copied into the sandbox at `/uploads`; a PNG, JPEG, GIF or WebP (by its bytes, up to 5 MB) is also shown to the model (decision 0034). Without a choice the sender's default provider runs. `409` a run is already live, `422` the choice is unusable, a file is too large, or the model takes no images, `503` the agent could not start (no provider, runtime offline). `409` also while the agent waits for an answer (`awaitingAnswer`).
- `POST /threads/:id/answer` `{ answers: [{ questionId, value }], providerId?, modelId?, reasoningEffort? }` answers the agent's question (see below) and continues the run, returning `202`. One answer per question, in any order. `409` nothing is waiting, or a run is live; `422` the answers are not the questions' own.
- `POST /threads/:id/cancel` stops the run and its background commands.
- `GET /providers` returns the user's providers; `GET /providers/:id/models` returns `{ models, efforts }`.

## Run stream

`GET /threads/:id/events` is `text/event-stream`. Every message is `data: <json>` with a `type`, plus a keep-alive `event: ping` every 5 seconds. Always attach before or right after sending; a snapshot comes first, so reconnecting is safe at any time.

```
snapshot    { messages: Message[], running: bool, usage?: Usage }   replaces all local state
run_start   { prompt, attachments?: Attachment[] }
text        { delta }
tool_start  { tool: Tool }
tool_end    { id, status: "done" | "error", output?, image?: Image }
run_resume  {}   the question was answered and the run continues in the same assistant message
usage       { turn: Tokens, context?: Context }   one model call's tokens, and how full the context is; not part of the transcript; add `turn` to the totals
done        {}
error       { message }
```

```
Message = { id, role: "user" | "assistant", parts: Part[], attachments?: Attachment[] }   attachments only on a user message
Part    = { type: "text", text } | { type: "tool", tool: Tool }
Tool    = { id, name, target, status: "running" | "done" | "error", diff?: DiffLine[], output?, questions?: Question[], image?: Image }
Image   = { name, mediaType, caption? }   an image the agent showed; GET /threads/:id/artifacts/:name serves it (decision 0033)
Attachment = { name, mediaType, size, image? }   a file sent with a message; `image` is the name GET /threads/:id/artifacts/:name serves it by (decision 0034)
Question = { id, text, choices?: [{ label, value }], allowCustom?: bool }
Context  = { usedTokens, contextWindow }
Tokens   = { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens }   input is all of the input; the cache figures are parts of it
Usage    = { totals: Tokens, context?: Context }
DiffLine = { type: "add" | "del" | "ctx", text }
```

### The reducer (must match `packages/protocol/src/events.ts`)

Keep `messages` and `running`. For each event:

- `snapshot`: `messages = event.messages`, `running = event.running`.
- `run_start`: `running = true`; append `{ id: "m-<n>", role: "user", parts: [text(prompt)] }` (with `attachments` when the event has any) then `{ id: "m-<n+1>", role: "assistant", parts: [] }`, where `n` is the message count before.
- `text`: on the **last assistant message**, if its last part is text, append `delta` to it; otherwise add a new text part.
- `tool_start`: add `{ type: "tool", tool }` to the last assistant message.
- `tool_end`: in the last assistant message, find the tool part with that `id` and set its `status` and `output`, and its `image` when the event has one.
- `run_resume`: `running = true`; nothing is appended.
- `done`, `error`: `running = false`. (`error` should also be shown to the user.)
- Anything else: ignore (new event types may be added; never fail on an unknown one).

### The agent's question

The agent can stop to ask the user (`ask_user`). That is a tool part named `ask_user` with `questions`, and the run ends with `done`. A thread is waiting for an answer when the transcript's last part is such a tool with `status: "running"` and `running` is false (or `awaitingAnswer` is true). Show the questions: with `choices` the user picks one, with `allowCustom` they may write their own, with neither they write an answer. Send every answer to `POST /threads/:id/answer`. The run continues: `run_resume`, then `tool_end` with `output` `{"answers":[{"questionId","value"}]}`, then the rest of the reply. No message can be sent while a question waits.

## What stays server-side

Provider keys, runtimes' tokens and the model gateway are never exposed to clients. A client never talks to a runtime.
