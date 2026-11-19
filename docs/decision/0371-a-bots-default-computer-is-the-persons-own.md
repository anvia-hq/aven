# A bot's default computer is the person's own

Status: accepted. Refines 0227, where a bot with no chosen runner used the built-in runner or `AVEN_BOT_RUNNER`.

## Context

A bot's Computer setting says Default, and Default was the control plane's own runner. On a server that is the server, not a machine the person registered, so every bot's commands and files ended up there even for someone who had connected their own computer.

## Decision

- **Default means the person's registered computer.** For a bot with a computer and no runner of its own, `registeredComputerOf` picks one of the person's own manual runners that is not revoked, not a host runner and not a sandbox: the one that is online, else the one seen last. `BotRunner` resolves it when a message arrives, so the replier and the checks see a bot with a runner; the bot's computer and artifact routes resolve it the same way. A bot whose person has no registered computer keeps the built-in runner.
- **A deployment that names a bot runner keeps it.** When `AVEN_BOT_RUNNER` is set, an operator chose where bots work, so nothing is inferred and Default stays that runner.
- **A bot that names a runner, or has no computer, is unchanged.**

## Consequences

- A registered computer that is offline makes the bot say its computer is offline, instead of quietly running on the server.
- Which machine Default is can change when the person registers another one or the first goes offline; a bot that should stay put is given a runner in its settings.
