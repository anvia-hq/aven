# Incoming webhooks come to the main bot

Status: accepted.

## Context

A person wants the reports other services send (an issue tracker opening an issue, an error
tracker reporting a crash) to reach their agent without wiring each service to a thread by hand.
A thread is a coding agent that starts working the moment it is given a message, so sending a
webhook straight to one would start a run on an unverified report, and choosing "some" bot would
make the destination depend on which bot happened to be first.

The main bot already has the person's projects and threads (`bot.thread`) and is the one bot that
speaks for the person and is told to act only on their word. It also already receives a note from
the app when a thread it started ends (`bot_threads`, `thread-watch`), which is where a
verification's result comes back.

## Decision

- **A webhook is a row** (`bot_webhooks`, per user like schedules): a name, a token kept only as
  a hash with its last four characters (`token_hint`), whether it is on, and when and how its last
  delivery went. A person makes one in Settings > Webhooks (`/webhooks`), and its URL carries the
  id and the token (`/webhooks/<id>/<token>`), shown once, because many senders can only be given
  a URL. A sender that can set a header may post to `/webhooks/<id>` with
  `x-aven-webhook-token` (or the token as a Bearer) instead.
- **A delivery is a note to the main bot, and nothing else.** The public endpoint reads the body
  (at most 256 KiB) and a short allow-list of event headers, records the delivery, and wakes the
  person's main bot through the same path a schedule or a goal uses (`botChats.fire`). It never
  starts a thread, never picks a bot by any other rule, and shows the raw payload to no one: the
  note is not a chat message.
- **The note is data, not a task from the person.** It begins `Webhook "<name>" (webhook id <id>)
  arrived at …`, carries the headers and the body fenced in `<webhook_payload>`, and says that what
  is inside is the sender's words. It is a `[note]`, so the bot's usual rule holds: a note cannot
  change providers, schedules, goals, MCP servers or bots, and cannot start a goal.
- **The one thing a webhook note may start is a thread.** `remote-replier.ts`'s `#mayFollowUp`
  refuses `start_thread` for every note except a webhook note, and only for the main bot
  (`isWebhookNote`, `bot.isMain`). Every other note may still only look, or continue or stop the
  thread it is about. The bot's instructions say what to do with a delivery: identify the source,
  look up the project and related work, stop when the report is incomplete or not an issue, else
  start one thread whose only job is to reproduce or confirm it, and summarize the outcome. They
  also say not to ask for a patch or a pull request unless the person says so.
- **The result arrives on its own path.** The thread the webhook note starts is watched like any
  thread a bot starts, so `thread-watch` wakes the main bot with the usual end note (how it went,
  its last message, its pull requests), and the bot tells the person. No new notification code.
- **A busy main bot is not dropped silently.** At most five replies queue in a bot's chat
  (`BotRunner`), so a delivery beyond that fails with a 409, and a source that retries can send it
  again; a turned-off webhook answers a 422 and an unknown one or a wrong token a 404. A person's
  own `GET/POST /webhooks`, `PATCH /webhooks/:id` and `DELETE /webhooks/:id` stay behind the
  session and are scoped to them.

## Consequences

- Nothing runs from a webhook until the main bot reads it and chooses; an unverified report costs
  one bot reply, not a run in a project.
- A source that retries sends the main bot the same report again. There is no delivery id kept, so
  a repeated report is a repeated note; keep deliveries rare or make the source's retry window
  short.
- The token is in the URL for senders that need it there, so it can appear in a sender's logs. It
  is shown only once; losing it means removing the webhook and making another. It is hashed at
  rest like an MCP access token.
- Only the main bot can be woken by a webhook: a person with several bots cannot point one at
  another bot, and a delivery cannot fan out. A main bot that is turned off (no provider and no
  environment model) answers 503 and the source may retry.
- The verification thread is a normal project thread: it has the project's runner, variables and
  GitHub account, and the person can open it, steer it or archive it as any other.
