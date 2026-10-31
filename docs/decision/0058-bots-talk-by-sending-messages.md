# Bots are agents that talk by sending messages

Status: accepted. Narrowed 0008 for an agent with no sandbox; superseded in that part by 0059, which gives a bot a computer and runs it on a runner.

## Context

A person should be able to chat with a bot of their own, as with Grok Bot: a named agent with a face, a way of talking and a conversation of its own. A thread's agent is a coding agent: it needs a project, a runner and a sandbox, and it streams its work. A bot has none of that for now. It only talks, and it talks in several short messages, each shown after a pause, not as one streamed answer.

## Decision

- **A bot is a row** (`bots`, per user like providers and skills, so it follows them into every organization): `name`, `avatar` (an emoji for now, empty shows the name's first letter), `instruction` and `isMain`. Every person has a main bot, made the first time `GET /bots` is asked for, which they can change but not delete. The schema allows more than one; nothing creates them yet.
- **One tool, `send_message`** (`packages/agents/src/tools/send-message.ts`). It is the only way the bot speaks: what it writes outside the tool is never shown, and it may call the tool many times in a turn. The name is snake_case like the other tools.
- **The pause is the host's, and computed** (`bot-delay.ts`): 40 ms per character of the message, between 0.6 and 4 seconds. It is a function of the text, so it is testable, and it is waited out inside the tool call so the messages stay in order and a cancel reaches it through the abort signal.
- **No streaming.** The bot runs with `agent.generate`; nothing is shown until it sends a message.
- **It runs in the control plane**, with a provider of the person's (`resolveModel`: the bot's own choice, else their default), not on a runner. Decision 0008 moved agents to runners so the control plane stops running a shell on its own machine; a bot has no shell, no files and no network tool, so that risk does not apply. This is not a way around 0008 for any agent that has a sandbox.
- **Its conversation** is Anvia memory in the same tables as threads', under the bot's id, scoped by its owner (`botMemoryStore`, `includeUserId`: a bot belongs to a person, not to an organization).
- **Its instructions** are tagged sections (decision 0051): role, messaging, safety, and the person's own `persona`. The messaging rules come from us and the persona cannot remove them. The bot is run with its name and instruction as they are when the message is sent.
- **Replies are one at a time.** A message that comes while the bot is at work is in the chat at once and waits its turn, so what the bot remembers is in the order it was said; a bot owes at most five replies (a sixth message is refused with a 409). Nothing cuts a reply short but a shutdown.
- **The API**, for the signed-in user: `GET /bots` (makes the main bot the first time), `PATCH /bots/:id` (name, avatar, instruction, and the model: `providerId` and `modelId`), `POST /bots/:id/messages` (202; the reply is events) and `GET /bots/:id/events` (SSE: the chat, then `message`, `typing` and `error` events, ping every 5 seconds). `@aven/protocol/bots` has the types and a small reducer; the platform shows it at `/bot`, from an icon in the rail under the logo.

## Consequences

- The bot is not a coding agent and is not built on one: `createBotAgent` builds its own `Agent`, with its own instructions, one tool and a memory store. What it shares with the coding agent is `agent-model.ts` (how a model is built from a config, the provider's options, the reasoning effort, retries, and when old history is summarized), so the two cannot drift on that and neither depends on the other.
- A bot's replies reach the web client as events of their own, not as `RunEvent`s: the text event concatenates, so several messages would become one, and a new run event would change the wire version and the native contract for a feature only the web has.
- A model that cannot be used (no provider and no environment key) is refused with a 503 before the message is added.
- **Known limits:** a chat on a model with no known context window is not summarized until its size is set; the typing pause is a guess to tune by feel (40 ms a character, 0.6 to 4 seconds); the person cannot stop a bot that is typing.
- **A bot's model** is one of the person's providers and one of its models, set at Settings > Bots (`bots.provider_id` and `model_id`); with none, the bot uses the person's default provider. The API refuses a provider that is not theirs, a provider chosen without a model leaves the model to the provider, and removing a provider puts its bots back on the default (the model goes with it).
- **Reasoning effort** (`bots.reasoning_effort`) is a level of the bot's own model, checked when it is set (a refusal in words, from the same check a message's choice gets), and cleared when the model changes or the bot goes back to the default: a bot on the default has none, since the default can change under it.
- **Compaction** (`bots.compact_after_tokens`): past that many tokens the bot's earlier turns are folded into a summary by the bot's own model, as a thread's are (the agent's memory `compaction`, which the Drizzle store supports), so a chat can go on without end. Empty is 70% of the model's context window, which needs a model whose window is known; for another (an OpenAI-compatible server) the size must be set. The chat the person sees is read from the stored history, which a summary does not remove.
- Not built: more than one bot (the schema allows it), uploaded avatars, memory the bot keeps on its own, and a bot that starts the conversation.
