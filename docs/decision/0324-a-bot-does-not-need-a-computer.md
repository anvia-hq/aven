# A bot does not need a computer

Status: accepted. Supersedes the part of 0059 and 0227 that gives every bot a computer. Leaves the rest of 0227 (a null `runtime_id` is the deployment's runner), 0318 (a hosted bot keeps its session) and 0319 (a new thread picks its computer before its project). Amended the day after: a new bot is made with no computer.

## Context

A bot was made with a computer whether or not its work needed one. `bots.runtime_id` null does not mean "no computer": it means the built-in runner, or `AVEN_BOT_RUNNER` (0227). `RemoteBotReplier.ready` asks that runner before a reply and throws "The bot's computer is offline" when it is down, so a bot that only talks cannot answer on a control plane with no runner connected.

The switch alone did not change what a person meets first. `bots.has_computer` defaulted to true and nothing wrote it, so every bot made from the settings was born with a computer, and on a control plane with no runner it could not answer at all — the case this decision was written for. Which of the two a bot starts as is the thing that decides it.

## Decision

- **A bot has `has_computer`** (`bots.has_computer`, not null). **A new bot is made with none**: `botsService.create` and the main bot's insert write `false`, so a bot made in the settings, and the main bot of a new workspace, answer in the control plane and are given a computer in Settings > Bots when they need one. The column keeps its `true` default, so a row written before this keeps its computer.
- **Null `runtime_id` still means the deployment's runner**, and only while `has_computer` is true. Turning it off clears `runtime_id`. Turning it on again uses the runner the settings name, or the deployment default when that is null.
- **A bot with no computer answers in the control plane.** `TalkBotReplier` runs `createBotAgent` on the bot's model provider. It does not open a runner connection, place a machine, or acquire a sandbox. The person is told the bot only talks.
- **A subscription agent still needs a computer.** Claude and Codex keep a session on the runner (0318). Choosing one for a bot with no computer fails before a reply, with `UnavailableError`: "This bot has no computer. A subscription agent needs a computer; choose a model provider instead."
- **Work that needs the machine fails clearly.** `GET /bots/:id/computer` answers `{ available: false }`. Waking it, reading an artifact, or sending a file throws `UnavailableError` ("This bot has no computer"). Nothing is sent to a runner, and no runner is invented.

## Consequences

- A new bot starts talk-only: it chats, messages other bots, asks the person and reads project files on the control plane. Its schedules, goals, thread work and anything that needs a machine wait until a computer is turned on for it.
- That includes the main bot and a bot the main bot makes, so the main bot's own work on schedules, goals and threads waits for its computer to be turned on.
- A new bot on an account whose provider is a Claude or Codex subscription cannot greet or answer until it is given a computer, since the rule above refuses a subscription agent without one. The chat says so, with what to do about it.

## Not done

- The no-computer agent does not get the tools that call back into the control plane (schedules, goals, threads, providers, MCP, the API, notes, the cockpit). Those do not need a machine; they are still wired through the runner's reply.
- Files the person attaches are named in the prompt and not written anywhere, because there is no computer to write them to.
