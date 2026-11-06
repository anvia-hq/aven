# A message sent shows at once

Status: accepted.

## Context

A thread's transcript comes from the server: `POST /threads/:id/messages` resolves the sender's model, skills, MCP servers, GitHub account, variables, memory and cockpit, then asks the runner to start and only then emits `run_start`, which is what puts the person's message in the conversation over server-sent events. With the composer keeping its text until that request resolved, the words stayed in the box for the whole round trip and the message appeared a moment later: nothing on screen changed while the send was under way.

A message sent to an agent that is already working has been shown at once since 0098: it stands in the conversation as a queued message. Only the one that starts a run waited.

## Decision

- **The message is drawn before the server has it.** `useThread.send` adds a `PendingMessage` to the thread's view as soon as it is asked to send, and clears the composer at once (`hooks/use-thread.ts`, `hooks/use-send-composer.ts`). Its text, its mentions and its files (with their size, counted from the base64) are exactly what the request carries.
- **The event that brings the real one drops it** (`pending-messages.ts`): `run_start` for the message's words, `steer`/`steer_queued`/`steer_rejected` by the id it was sent with, and a `snapshot` for a stream that attached again, which may already list it. Both state changes happen in the same event handler, so the two are never on screen together.
- **A message that was not sent goes back into the composer**, unless the person has begun another one, whose words are not replaced; then a notice says what was lost. This is what the steering path of 0098 already did.
- **It is drawn a little quieter** while the server has not confirmed it (`ThreadMessage`'s `sending` prop), so a person can tell it apart from one the agent has.
- **The pending message is the platform's alone.** Nothing on the wire changes: the transcript the server owns is untouched, and a client without this still gets `run_start` as before.

## Consequences

- A send that fails leaves a toast and puts the draft back; the conversation is where it was.
- Two tabs of the same person both drive a thread; each shows its own message at once and settles it on the events, matching by words (and by id for steers). A message sent from the other tab arrives as the server's own, with nothing pending here.
- The conversation scrolls to its end on the optimistic message, the same as on a real one, because `useScrollToBottom` counts messages.
- Bots' chats are not covered: their replies are not runs, and a bot's chat is written by the server.
