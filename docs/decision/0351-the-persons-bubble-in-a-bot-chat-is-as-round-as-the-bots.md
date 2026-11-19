# The person's bubble in a bot chat is as round as the bot's

Status: accepted. Adds to 0384 (the overview cards are as round as the composer).

## Context

A bot chat draws the two sides of the conversation as different bubbles: the bot's is a `Bubble` at `rounded-2xl`, and the person's was `rounded-lg` — half the radius of the bubble it answers, so a reply and its question looked like two different kinds of message. A thread's own person bubble is `rounded-2xl` too, so the bot chat was the one place where the person's side was squarer.

## Decision

- **The person's bubble is `rounded-2xl`** (`bots/components/bot-chat-bubble.tsx`), the radius of the bot's bubble beside it and of a person's bubble in a thread.
- The tint, the quote inside it and the joined-corner treatment of the bot's own bubbles stay as they are: only the radius changes.

## Consequences

- The two sides of a bot chat read as one conversation, and a person's bubble looks the same in a thread and in a bot chat.
- The radius is a class on that one element; it is not shared with the bot's `Bubble`, whose corners are trimmed when two of them are joined.
