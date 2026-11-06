# A bot is told once to send what it wrote

Status: accepted. Adds to 0058 (a bot's own agent) and 0059 (a bot's reply runs on a runner).

## Context

A bot reaches its person only through `send_message`; what it writes outside it is never seen (`bot-instruction.ts`). A model that ends its turn with plain text instead, as `claude-haiku-5-5` did for a person's last three messages on the homelab, leaves the person with no answer at all, and nothing says why: the chat shows only the messages they sent.

## Decision

When a reply to a person's own message ends and the bot has said nothing in it (no `send_message` to the person or to another bot, no question, no request for a key), the runner gives it one more turn with a note that says so and asks it to send its answer now (`BotReplies`, `UNSENT_NOTE`). The note is a `[note]`, which the chat does not show, and it is given once: a bot that still sends nothing ends the reply as before.

A reply to a note (a schedule, a goal's round, a thread that ended) or to another bot is left alone: there it is right for a bot to have nothing to say.

## Consequences

A model that forgets the tool is answered after one more model call instead of never. The answer is a real `send_message`, so it is kept in the conversation and shown again after a reload, which a text the runner sent on the bot's behalf would not be.
