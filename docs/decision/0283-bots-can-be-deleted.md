# Bots can be deleted, by the person and by the main bot

Status: accepted. Builds on 0060.

## Context

0060 let the main bot make bots and left no way to remove one. A person who made a bot by mistake, or the twentieth, had to live with it.

## Decision

- **The person deletes a bot** from its settings dialog, after a confirmation: `DELETE /bots/:id`. The main bot cannot be deleted.
- **A deleted bot is gone with its schedules, goal, threads it watched and notes** (they cascade from `bots`), and its chat in the agent memory tables is cleared first (`BotRunner.forget`).
- **A bot that is at work cannot be deleted**: the call is refused with a conflict and the person or the main bot tries again when it is done.
- **The main bot has a `delete_bot` tool, and no other bot does.** It takes the handle of a bot, as `list_bots` shows it, and is a `bot.delete` call to the control plane (wire version 60). Like `bot.create` it is refused unless the reply's own bot is the main one and the person's own message started the reply, not a note or another bot; `canCreateBots` on `bot.reply` decides whether the runner offers the tool.

## Consequences

- A model can still be fooled into deleting a bot, which is why the tool says to use it only on the person's own message and to ask when the request is vague. Deleting is not undoable.
