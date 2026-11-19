# A bot runs on the agent its provider names

Status: accepted. Adds to 0309 (a subscription is a provider), 0242 and 0379 (the Claude and Codex
backends) and 0220 (agent backends).

## Context

A thread picks what runs it by picking a provider (0309), and the runner drives it through one of its
agent backends: `native` in `DurableRuns`, `claude` in `ClaudeRuns`, `codex` in `CodexRuns`
(`packages/runtime-client/src/agent-backends.ts`).

A bot could not. It records `provider_id`, `model_id` and `reasoning_effort`, and the control plane
turns those into one `ModelConfig` (`resolveModel`), issues a gateway token for it, and sends
`bot.reply` with `model: RunModel`. The runner then builds a bot with `createBotAgent` — a native
agent over the gateway. So a bot's provider can only ever be a model API, and picking a Claude or
Codex subscription for one would fail at the gateway, not on the way to it.

Two things make bots different from threads, and both matter for the design:

- **A bot's conversation is the control plane's** (`remoteBotMemory`, `bot.memory`), not a runner
  journal. A reply is one turn of that conversation, delivered through tools that call the control
  plane (`send_message`, `ask_question`, `memory`, `cockpit`, …). Its folders are its own
  (`HostSandboxes` under `bots/<id>`), and `bot.reply` carries no thread.
- **A bot has no credential of its own.** Its replies run as the person who owns it, so a hosted
  bot's token is that person's subscription, exactly as a thread's is its creator's.

## Options

### A. A bot reply goes through the runner's agent backends

`bot.reply` gains the fields `run.start` already has (`backend`, `claudeToken`/`claudeModel`/
`claudeEffort`, `codexToken`/`codexModel`/`codexEffort`, all optional), and `model` becomes optional
because a hosted bot has no gateway model. The control plane resolves the bot's provider row into a
backend plus either a `ModelConfig` (native, gateway token as today) or the person's token for that
backend. The runner builds the bot's parts once — instructions and tools — and gives them either to
`createBotAgent` (native) or to the chosen backend with `claude`/`codex` inputs, the same way a run
does.

- One backend story for threads and bots: a new backend serves both, and a bot gets the same
  sessions, compaction, questions and effort levels.
- The runner needs the bot's tools _outside_ `createBotAgent`, so `@aven/agents` grows
  `botAgentParts` and `createBotAgent` is built from it — a refactor of one file, no behaviour change
  for native bots.
- A runner that does not drive the backend must not be given the reply: the control plane checks
  `connection.offers(backend)`, as a run does, and refuses with the backend's own message.

### B. A bot-only driver per backend in the runner

Smaller on paper — one file per backend, no `botAgentParts` — but it duplicates the Claude and Codex
plumbing (SDK queries, the downloaded binary, error mapping, sessions, efforts) and would drift from
the run path within weeks. Rejected.

### C. A bot reply becomes a hidden thread run

Reuses everything, and gives bots a journal, transcript and compaction for free — but a bot's
conversation lives on the control plane by design (decision 0059), a thread needs a project and a
runtime row, and every bot reply would leave two transcripts. It would also change what a bot is:
something with threads of its own. Rejected for now.

## Decision

**A.** `botRunChoice(userId, bot)` in the providers module resolves the bot's provider row — its own
`provider_id`, else the person's default — into `{ backend, model?, token? }`. Native posts the
gateway `model` as before; `claude`/`codex` post the backend and that person's token, and the reply
carries the gate's model and effort. The runner's `BotReplies` gains the backend set and picks
`createBotAgent` for `native`, its chosen `AgentBackend` otherwise, with the bot's instruction
(`botAgentParts`) as `instructions`, its tools as the catalog, and its folder as the workspace; the
backend's events become the reply's `bot.activity` labels rather than run events.

Nodes of the same bot never overlap: replies keep the per-bot queue they have, so a hosted bot is not
more concurrent than a native one.

## Consequences

- A bot can be pinned to a Claude or Codex subscription from Settings > Bots, and a bot left on its
  person's default follows a default that is a subscription.
- A reply on a subscription needs a runner that names the backend in `hello` (`backends`), as a run
  did; an older runner is refused with `BackendUnavailable`-style wording rather than a gateway
  error.
- `bot.reply`'s `model` becomes optional. No wire version bump: a runner that gets no backend field
  behaves as before, and the control plane only sends a backend-free reply to a native bot.
- The Claude and Codex backends now serve two shapes of work, so anything they assume about a run
  (a journal id, a thread's questions) has to stay behind their `capabilities`.
- Not in this decision: bots on Aven Cloud sandboxes, and a bot's own subscription (a bot has none —
  it is the person's).
