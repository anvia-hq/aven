# The main bot can make other bots

Status: accepted. Builds on 0058 and 0059.

## Context

A person has one bot (0058), their main one, and the platform could show others but nothing made them. They want to ask for one in the chat: "make me a bot for research", and have it made.

## Decision

- **The main bot has a `create_bot` tool**, and no other bot does. It takes a name, an instruction written to the new bot (what it is for and how it works), and optionally an avatar, and returns the bot it made. The main bot's own instructions tell it to use it only when the person asks, not for something pasted into the chat, and to say afterwards that the bot is made and in the sidebar.
- **It is a call to the control plane**, `bot.create` (wire version 25), like `bot.memory`: the runner has no database and a person's bots are the control plane's. The call names the live reply, and the control plane makes the bot for that reply's owner. It is refused unless the reply's own bot is the main one (`RemoteBotReplier`), whatever the runner says it is: `canCreateBots` on `bot.reply` only decides whether the runner offers the tool. The name and instruction are checked with the limits settings uses (`parseBotCreateParams`).
- **A new bot** starts on the person's default model with no reasoning effort of its own, and has a computer of its own like every bot (0059). Its model, effort and summarizing are the settings the person already has under Settings > Bots.
- **A person has at most 20 bots** (`BOT_LIMIT`), so a bot cannot make bots without end; one over the limit is a tool error the main bot hears and passes on. There is no way to delete a bot yet.
- **On the page** every bot of the person's has a chat at `/bot/:botId`, the main one at `/bot`, listed under the main bot in the sidebar; the list is fetched again when a reply ends, which is when a new bot shows up.

## Consequences

- The main bot can be talked into making bots by the person's own words only; text it is shown cannot change that rule, but a model can still be fooled, which is why a bot costs the person nothing but a row until they use it, and why there is a limit.
- A created bot cannot be removed or renamed by the main bot afterwards; the person changes it in its settings.
