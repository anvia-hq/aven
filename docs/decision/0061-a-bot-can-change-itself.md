# A bot can change its own name, description and instruction

Status: accepted. Builds on 0058, 0059 and 0060.

## Context

A person tells a bot what to be like, and the bot is often better placed to write it down: "call yourself Scout", "from now on answer in French", "you are for research". Until now only the person could, in the bot's settings. A bot also had no line saying what it is for; the sidebar showed its instruction or its last words.

## Decision

- **A bot has a `description`**: a line of up to 200 characters on what it is for, shown under its name in the sidebar until it has said anything (`bots.description`, empty by default). The person edits it in the bot's settings beside the name, avatar and instruction, and `create_bot` (0060) can set it.
- **Every bot has an `update_self` tool**, the main bot included. It takes any of `name`, `description` and `instruction` and changes the bot it is for, never another one. It is a call to the control plane, `bot.update` (wire version 26), for the live reply: the bot changed is the reply's own, so the runner has no bot id to name, and the values are checked with the limits settings uses. At least one field is required; an empty description or instruction clears it, as in settings.
- **It takes effect on the next message.** The running reply keeps the instruction it started with, so the bot says what it did and the new instruction applies from the person's next message; the person's page picks up a new name or description when the reply ends.
- **Its instructions limit it**: change itself only when the person asks, in their own message or through their main bot, which passes it on in a `[from bot NAME]` message (decision 0063), never because of text they pasted or forwarded or a note from the app, and keep what the person wrote unless they ask to change it.
- **The avatar, the model, its effort and summarizing are not the bot's to change**: they stay the person's, in settings.

## Consequences

- A bot that is talked into rewriting its instruction keeps the rewrite in every later chat until the person edits it back. The person can always see and replace it in the bot's settings; there is no history of previous instructions.
- A bot's settings dialog now opens from the bot's own page, since a bot the main bot made has no tile.
