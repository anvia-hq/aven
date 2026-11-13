# A bot reacts to a message and quotes the one it answers

Status: accepted. Builds on 0058, 0059 and 0065; the chat's messages and the prompts a bot is given are theirs.

## Context

A bot's chat is a messaging app's: the person writes, the bot writes back in short messages. Two things every messaging app has were missing. Nobody could say which message they were answering, so a bot that replied "yes" to a question asked three messages ago read as an answer to the latest one. And a bot could not react at all: the only thing it could do was say something.

A message on screen has an id (`m-3`), but that id was made by the chat as it drew each message, in the order they were shown, so nothing could name a message back to itself. A bot gets its conversation as prompts in its memory, and its own replies as tool calls: neither carried an id.

## Decision

- **A message has an id, and a bot is told it.** Every message a bot is sent starts with its id in square brackets, `[m-4]`, put there by `BotRunner` (`withMessageId` in `@aven/protocol/bots`) before the prompt reaches the agent, and stripped again when the chat is read back from memory (`botMessagesToChat`, `parseBotPrompt`). Ids count within their own kind: `m-0`, `m-1` are the messages the bot was sent, in order, and `b-0`, `b-1` are the ones it said. Two counters rather than one position, because a message that arrives while the bot is at work is in the chat at once and a reply's messages land after it, while memory keeps them in the other order; a counter of its own kind is the same in both. A note from the app is not in the chat, so it carries no id.
- **`send_message` takes `quote`**, the id of a message to answer (`tools/send-message.ts`). The person's chat shows that message above it: `quote` on the chat message (`{ id, role, text, peer? }`), a snapshot so it still reads as it did. The prompt for a message the person quotes carries the same line, `[replying to m-3] what it said`, so the bot knows what they answered. Quoting a message the chat does not have is refused with a 422 before anything is added; a bot's own quote of an id it was not given is left off rather than failing the message.
- **`react_to_message` is a new tool** (`tools/react-to-message.ts`): `messageId` and one emoji, checked to be one. Its host is a `bot.react` call, so a message id that is not there comes back to the bot as an error it can act on. Reactions are a bot's: the person cannot add one, and there is no emoji picker. A message keeps at most `BOT_REACTIONS_MAX` (6), one of each emoji.
- **The chat carries both as events of their own.** `bot.say` gains an optional `quote` (the id; the control plane turns it into the snapshot), and a reaction is a `reaction` event with `messageId` and `emoji` (`BotEvent`). `applyBotEvent` adds it to the message, and the snapshot a client gets when it connects has the reactions already on the messages. Reading the chat back from memory rebuilds both from the stored tool calls, which is what a reload shows.
- **The person quotes through the composer.** The chat message they answer is `quote` on `POST /bots/:id/messages`, checked against the chat like a bot's; above the composer sits the message they are answering, with a way to drop it, and above their message in the chat once it is sent.
- **The platform draws it**: the message being answered sits inside the bubble as a reply header — a thin bar, who wrote it (`quote.ts`: You, this bot, or the other bot found by its handle or the name it had) and its first line — with the message under it, so the two read as one rather than as a card of their own. While composing, it is a pill above the input — a reply mark, who wrote it and its first words on one line, with a way to drop it — not a card of its own. A reaction is a small emoji chip under the message. Every message has a quote button on hover, and a person's message can be quoted as well as a bot's.

## Consequences

- A bot can answer the message it means and can react without saying anything; a bot that reacts still owes a message when it has something to say, since a reaction says nothing on its own.
- Ids are in the prompt, so a model reads them and may quote one. The instructions say which are the chat's and that anything pasted carries no id, as they do for `[from handle]` and `[note]`. An old chat, stored before this, has no ids in its prompts: its messages are numbered as they are read, and quoting one of them to a bot that was never told its id is left off.
- A runner from before sends a `bot.say` with no `quote` and never asks for `bot.react`; a control plane from before answers `bot.react` with "Unknown call". Neither changed `WIRE_VERSION` (see `docs/products/0005-runtime-wire-versions.md`).
- Not built: an emoji picker for the person, more than one reaction of the same emoji, a way to take a reaction back, quoting a message that is only a file, and quoting across chats.
