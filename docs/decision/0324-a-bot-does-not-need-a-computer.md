# A bot does not need a computer

Status: accepted. Supersedes the part of 0059 and 0227 that gives every bot a computer. Leaves the rest of 0227 (a null `runtime_id` is the deployment's runner), 0318 (a hosted bot keeps its session) and 0319 (a new thread picks its computer before its project).

## Context

A bot was made with a computer whether or not its work needed one. `bots.runtime_id` null does not mean "no computer": it means the built-in runner, or `AVEN_BOT_RUNNER` (0227). `RemoteBotReplier.ready` asks that runner before a reply and throws "The bot's computer is offline" when it is down, so a bot that only talks cannot answer on a control plane with no runner connected.

## Decision

- **A bot has `has_computer`** (`bots.has_computer`, not null, default true). An existing bot keeps its computer. Turning it off clears `runtime_id`. Turning it on again uses the runner the settings name, or the deployment default when that is null.
- **Null `runtime_id` still means the deployment's runner**, and only while `has_computer` is true.
- **A bot with no computer answers in the control plane.** `TalkBotReplier` runs `createBotAgent` on the bot's model provider. It does not open a runner connection, place a machine, or acquire a sandbox. The person is told the bot only talks.
- **A subscription agent still needs a computer.** Claude and Codex keep a session on the runner (0318). Choosing one for a bot with no computer fails before a reply, with `UnavailableError`: "This bot has no computer. A subscription agent needs a computer; choose a model provider instead."
- **Work that needs the machine fails clearly.** `GET /bots/:id/computer` answers `{ available: false }`. Waking it, reading an artifact, or sending a file throws `UnavailableError` ("This bot has no computer"). Nothing is sent to a runner, and no runner is invented.

## Not done

- The no-computer agent does not get the tools that call back into the control plane (schedules, goals, threads, providers, MCP, the API, notes, the cockpit). Those do not need a machine; they are still wired through the runner's reply.
- Files the person attaches are named in the prompt and not written anywhere, because there is no computer to write them to.
