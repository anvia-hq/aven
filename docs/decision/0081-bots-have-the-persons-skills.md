# A bot has the person's skills

Status: accepted. Builds on 0035 (the agent has skills), 0058 and 0059 (bots and their computers) and 0080 (a bot is given what a thread's agent is, by the same means).

## Context

A thread's run carries its sender's enabled skills and the built-in ones; the runner puts them in the thread's `/skills` and the agent's instructions list them (0035). A bot had none: its `bot.reply` carried no skills, so what the person kept at Settings > Skills never reached a bot, though a bot has a computer to read and run them on.

## Decision

- **A reply carries the person's skills.** `RemoteBotReplier` asks `skillsService.forRun(userId)` (the built-in skills and the person's own enabled ones, theirs winning on a name) and sends them as `skills` on `bot.reply` (wire version 35, an optional field), as `run.start` does.
- **The runner fetches an archive with `bot.skill`.** A thread's run asks `skills.get` with its run id; a reply has no run, so it asks `bot.skill` with its reply id and a digest, which the control plane answers for a skill this reply was given and for no other: a digest the runner makes up, or one of another person's skills, is refused, and so is a skill whose archive is gone. The check is the reply's own list, never what the runner sends (`CallBotReply.skill`, answered in `RemoteBotReplier`).
- **Installed as a thread's are.** `BotReplies` calls the same `SkillStore.install` with the bot's id, which copies each skill into `<AVEN_RUNTIME_HOME>/skills/threads/<bot id>/`, mounted read-only at `/skills` in the bot's container by the thread's own `dockerRunArgs`, from archives cached by digest. Each reply installs in place of the last one's, so a skill the person switched off is gone by the next message. A skill that cannot be fetched or does not validate is left out with a warning and the reply goes on; a runner with no store for skills (`ThreadWorkspaces.skills`) gives the bot none. A bot has no repository, so it has no repository skills.
- **The bot is told, and reads them on its computer.** `botInstructions` takes the listing and adds the thread agent's own `<skills>` section after the computer section, only for a bot that has a computer (it reads a skill with `exec_command`).

## Consequences

- A runner on wire version 34 or older is refused: update it.
- Every reply fetches nothing it already has (archives are cached by digest) but lists and copies every skill into `/skills`, so a person with many skills pays that on each message.
- A bot picks a skill itself from its description. Choosing one by name from the composer's `/` is not done for bots: the bot composer has no `/`.
- Not tried against a real container or model: the tests use a real `SkillStore` over a temporary directory and scripted models; the mount is the thread's own code path, reached with the bot's id.
