# The main bot can message other bots

Status: accepted. Builds on 0058, 0059, 0060 and 0061. The idea (`@` mentions, a bot writing to another and hearing back) is the Anvia harness's, where bots share one thread; here each bot keeps its own chat with the person, so the exchange is shaped differently.

## Context

A person with several bots wants to say to the main one, "Ask @Scout to do A, B and C", and have it hand the work over and come back with what the other bot said. Bots could not write to each other, and the composer had no way to point at a bot.

## Decision

- **The person mentions a bot with `@`** in the bot composer: a menu of their other bots, a chip in the composer, and the text `@Name` in what is sent. A sent message draws `@Name` as the bot's chip. Nothing but the text travels: the main bot reads the name against the list of bots it is given.
- **The main bot has a `message_bot` tool**, and no other bot does. It takes a bot's id and a text and returns what that bot sent back. It is a call to the control plane, `bot.ask` (wire version 27), like `bot.create`: the runner has no other bot's chat. The main bot's reply carries the person's other bots as `peers` (id, name, description), which its instructions list; `create_bot` returns the new bot's id so it can write to it in the same reply.
- **The exchange is a reply of the other bot.** The control plane queues the text in that bot's own chat, behind whatever it is answering, as `[from bot Aven] text` (`botPrompt`), has the bot answer it as it would the person, with its own model, computer and memory, and returns the messages it sent (`BotRunner.ask`). The person sees it too: in the other bot's chat the text is a bubble labelled with the sender (`BotChatMessage.from`, read back from the stored prompt by `botMessagesToChat`), followed by the bot's messages. The bot's instructions say that such a message is from a bot, not the person, and that what it sends goes back to that bot.
- **It waits**: the main bot's tool call waits for the other bot's reply to end, at most five minutes (`BOT_ASK_TIMEOUT_MS`); past that the main bot is told the other is still at work and its answer will be in its chat. A bot that fails is reported to the asker as an error. A bot that sends nothing returns no replies. The runner's wait for the call is longer than the control plane's.
- **No loops**: only the main bot may write to bots, whatever the runner says (checked on the control plane in `RemoteBotReplier`), the other bot's reply is a plain one with no `peers` and no `create_bot`, a bot cannot write to itself, and only the person's own bots can be written to. A bot at its limit of waiting replies refuses more, as for the person.
- **Messages are plain text**, up to what a person may send (`BOT_MESSAGE_MAX`, 4000 characters), and the other bot's messages come back as text, so what it saw on its computer does not.

## Consequences

- Asking is synchronous: the main bot is typing while it waits, and a slow bot makes it slow. The alternative, fire and forget with the answer arriving later as a message, needs a way to start a reply of the main bot without the person, which bots do not have.
- The other bot's chat grows with what the main bot asks it, and its memory with it; the person can read all of it.
- Bots written to are found by id, and the main bot reads `@Name` against names. Two bots with one name are told apart by their ids in its list, and the instructions say to ask the person which when they cannot be told apart.
- Other bots cannot write to each other or to the main bot; that is not built.
