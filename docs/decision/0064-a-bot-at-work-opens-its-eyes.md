# A bot at work opens its eyes

Status: accepted. Builds on 0062; the behavior and the drawing are the Anvia harness's (`bot-avatar.tsx`, its `mood`, and `bot.working` in its list).

## Context

0062 drew each bot as a character but left out half of it: in the harness a bot's eyes are shut while it is idle, and open while it works, looking about, with a ring that spreads from it and a dot that goes round. It is how a person sees, in the sidebar, that a bot is busy, including one that works while they are in another bot's chat, such as a bot the main bot has written to (0063).

## Decision

- **A mood**: `BotAvatar` takes `mood`, `idle` or `working`. At work the closed eyes become two white eyes with pupils that look about (up and to the right, off to the left, or ahead, by the face), the bot bobs faster, and a ring and an orbiting dot in its color go round it (`reach` of its shape sets the ring). `data-mood` is on the svg. With reduced motion none of it moves, though the eyes are still open. The harness's third mood, sleeping, is never used there and is not here.
- **The server says who is working**: `GET /bots/working` is server-sent events of the ids of the person's bots that are at work on a reply now (a reply is working from the message that asks for it until the last reply behind it ends), first as it is and then each time it changes, with a ping (`BotRunner.working`, `workingOf`). A person sees only their own. The platform follows it with `useBotsWorking` and draws the main bot's tile and each bot's row with the mood; a stream that is lost claims nobody is working.
- **The chat's own line** is the harness's: the bot's avatar at work and "Name is typing…", in place of the three dots.

## Consequences

- One more open connection per person on the bot pages; nothing is polled.
- The working state is the control plane's memory of its replies, so a restart forgets that a reply was going on, which a restart ends anyway (0059).
- A bot's ring is larger than its avatar and overflows it, so a sidebar row does not clip what is drawn in it.
