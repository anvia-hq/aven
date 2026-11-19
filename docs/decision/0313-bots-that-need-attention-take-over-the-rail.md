# Bots that need attention take over the rail's bot slot

Status: accepted. Decided 2026-11-16.

## Decision

A person can have up to twenty bots and most of them were made by the main bot, so the rail's single bot avatar said nothing about which bot was waiting on them. The rail's bot slot now answers that.

What counts as attention, in this precedence for one bot: it asked a question the person has not answered (an API key request included), else its goal is `blocked`, else one of its enabled schedules last ended `failed` or `missed`, else it said something the person has not read. The control plane computes it in `botsService.list` from `bots.question_asked_at`, the goal's `updated_at` while blocked, the schedule's `updated_at` while failing, and `bots.last_said_at` against `bots.last_read_at`, and sends one `attention: { reason, since } | null` per bot. Nothing is stored as an attention flag and nothing is archived: a bot that needs nothing is simply left out of the slot.

- A bot that is working also takes its turn while it works, after the ones that need the person, with `Working` as its reason, so a long run is visible in the rail before it has said anything.
- `BotRunner` reports every bot-role message through a `said` callback, so `markSaid` covers replies, greetings, notes and bot-to-bot copies as well as `ask_question`.
- Answering clears a question: a message from the person (`chats.send`) or a letter that carries the person's word (`chats.deliver` with `relaysPersonsWord`) sets `question_asked_at` to null. A plain bot-to-bot letter does not, or a bot that asked its person something would stop being flagged as soon as another bot wrote to it. Opening the chat does not: `POST /bots/:id/read` and the chat stream's snapshot mark the bot read, which clears only a `message` reason.
- One avatar is drawn at a time, never a grid: the slot keeps the rail's own 36px box and 20px avatar, so nothing grows past the rail's margins. With nothing to show it is the main bot avatar as before.
- Once at least one bot needs the person or is working, that single avatar walks the list: Aven first, then the bots that need the person, longest-waiting first, then the ones that are only working. Each is shown until its own avatar finishes an animation cycle — the idle bob (3.6s) or two looks of the pupils while working (3.8s) — so the change lands on the avatar's own beat rather than an arbitrary tick, and the last one wraps back to Aven. Each turn starts the animation afresh (`BotAvatar`'s `delayMs` of 0) so no bot is cut short by the phase it would have had elsewhere in the app. With reduced motion there is no animation to follow and a 3.8-second timer does the same. Pointing at the slot holds the bot that is showing, so its cell can be clicked; the tooltip names it and says why.
- Each change throws a short burst of particles around the slot: eight 3px dots start on the avatar's rim and fade out over 0.7s (`bot-particle` in `index.css`, `bot-swap-particles.tsx`). With reduced motion no particles are drawn, and the timer alone marks the change.
- The bot list is refreshed on every change of the working set, on window focus, once a minute while the tab is visible, and every two seconds while any bot is working, so a bot's first words show up in the slot during its run, not only when it finishes.
- The rail has no extra trigger: a bot that is not its turn, or that needs nothing, is reached from `/bot`, whose sidebar lists every bot. The slot and that sidebar are the whole entry surface.
- `/bot`'s sidebar puts a dot on the avatar of every bot that needs the person (Aven's sits top-right, opposite its star), so a bot that is not on screen is still marked in the list. The mobile tab bar is untouched: the rail it would replace is `hidden md:flex`.

## Proof

`.aven/proof/bots-attention/before.png` is the slot the day before the change: one Aven avatar, whatever the bots below it were doing. `after.png` is the same rail with three bots waiting (`Scout · Needs your answer` in its tooltip), `after-working.png` a bot mid-run that has said nothing yet, `after-particles.png` a change caught mid-burst, and `after-sidebar.png` the dots in `/bot`'s sidebar. `rotation.gif` is ten seconds of the slot itself: the avatar changing bot on its own animation beat, a particle burst on each change, and the tooltip while the pointer holds it.

## Consequences

- `bots` gains three nullable timestamptz columns and one migration; no index, because every query filters by `user_id` or `id` and a person has at most `BOT_LIMIT` rows.
- The rail refreshes the bot list when the working set changes, on window focus, and once a minute while the tab is visible, so a blocked goal or a failed schedule shows up without a chat being open.
- `bots.updated_at` moves on every `markSaid` through `$onUpdate`; nothing reads it as "settings changed", so this is accepted. A consumer that does should move these writers to `sql` setters.
- There is no attention state for "the reply failed", and the question signal is only as good as the message stream: a question asked while the control plane was down never existed.
