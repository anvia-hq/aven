# Bots are agents that talk by sending messages

Status: accepted. Narrows 0008 for an agent with no sandbox.

## Context

A person should be able to chat with a bot of their own, as with Grok Bot: a named agent with a face, a way of talking and a conversation of its own. A thread's agent is a coding agent: it needs a project, a runner and a sandbox, and it streams its work. A bot has none of that for now. It only talks, and it talks in several short messages, each shown after a pause, not as one streamed answer.

## Decision

- **A bot is a row** (`bots`, per user like providers and skills, so it follows them into every organization): `name`, `avatar` (an emoji for now, empty shows the name's first letter), `instruction` and `isMain`. Every person has a main bot, made the first time `GET /bots` is asked for, which they can change but not delete. The schema allows more than one; nothing creates them yet.
- **One tool, `send_message`** (`packages/agents/src/tools/send-message.ts`). It is the only way the bot speaks: what it writes outside the tool is never shown, and it may call the tool many times in a turn. The name is snake_case like the other tools.
- **The pause is the host's, and computed** (`bot-delay.ts`): 40 ms per character of the message, between 0.6 and 4 seconds. It is a function of the text, so it is testable, and it is waited out inside the tool call so the messages stay in order and a cancel reaches it through the abort signal.
- **No streaming.** The bot runs with `agent.generate`; nothing is shown until it sends a message.
- **It runs in the control plane**, with the person's own provider (`resolveModel`), not on a runner. Decision 0008 moved agents to runners so the control plane stops running a shell on its own machine; a bot has no shell, no files and no network tool, so that risk does not apply. This is not a way around 0008 for any agent that has a sandbox.
- **Its conversation** is Anvia memory in the same tables as threads', under the bot's id, scoped by the user.
- **Its instructions** are tagged sections (decision 0051): role, messaging, safety, and the person's own `persona`. The messaging rules come from us and the persona cannot remove them.

## Consequences

- The bot reuses `createCodingAgent` (model, provider options, history rules) with its own instructions and no question, search or sandbox tools. `createCodingAgent` gained a `memory` option for it.
- A bot's replies reach the web client as events of their own, not as `RunEvent`s: the text event concatenates, so several messages would become one, and a new run event would change the wire version and the native contract for a feature only the web has.
- Not built: more than one bot, uploaded avatars, memory the bot keeps on its own, a bot that starts the conversation, and a model per bot.
