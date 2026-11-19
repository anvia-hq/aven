# A bot chat shows your message at once, and a new one rises into place

Status: accepted. Builds on 0117 (a thread shows the message at once) and 0333 (messages rise into place and the view glides to your own message); it covers the case 0117 left out.

## Context

A bot's chat is written by the server: `POST /bots/:id/messages` resolves the bot, prepares its files (base64 decoded, an image kept under a name of its own), works out its model, opens the chat and only then emits the person's message over `/api/bots/:id/events`, which is the only thing the platform draws. The words stayed in the composer for the whole round trip, and nothing in the conversation changed while it was under way. A chat whose event stream was reconnecting showed the message the server had already stored only when the next snapshot came.

Once it arrived, the row mounted with no transition, the view snapped to the bottom, and the person's own image was a blank box: its artifact URL is written by the runner later (`keepAttachments`), and without a local preview there was nothing for `SentImage` to hold.

## Decision

- **The message is drawn before the server has it.** `useBotChat.send` adds a pending message at once (`pendingMessage` in `modules/bots/pending.ts`: the words, the quote being answered, and each file with its size and, for an image, a base64 preview), and the composer clears as it does in a thread. The server's own copy — the same words and the same file names — settles it, and so does a snapshot that already lists it. A send that fails takes it back and leaves the draft in the composer.
- **The swap keeps the row and its image.** The event that settles a pending message records a handoff under the real message's id (`handoffOf`: the pending key and its attachments); the row keeps the pending React key and `SentAttachments` is given the local preview to hold over the artifact URL until it has loaded, exactly as 0117 does in a thread. A snapshot that settles a pending message has no handoff, so it remounts, as in a thread.
- **It is drawn as still being sent** (`aria-busy`, where a thread draws its own message a little quieter).
- **A message that arrives rises into place.** Only the ones that come in over the events, and the pending one, rise: 200ms, 6px, `ease-out-strong`, nothing for reduced motion. A chat that opens draws the history it already had still, like 0333.
- **Sending glides to the bottom**, settled on `scrollend` or after 600ms, and reduced motion keeps the instant jump. The hook is the thread's, `useScrollToBottom`, now given the pending messages as its outgoing ones.
- **Nothing on the wire changes.** `BotChatMessage` and `BotEvent` are as they were: the platform matches the server's copy by words and file names, as 0117 matches a run's start.

## Consequences

- A message the server stores but never echoes, because the event stream is down, stays pending until the next snapshot lists it; it is then replaced without a handoff.
- Matching by words is what a thread already does. Two sends of the same words and files settle one at a time, in order.
- The chat's own empty prompt is no longer drawn above a message that is still being sent.
- Bots' replies are whole messages, not runs, so there is no paced text to match a thread's streaming answer; the typing row and its shimmer are still the only sign of work between messages.
