# A bot keeps the person's providers and never sees a key

Status: accepted. Builds on 0006 (providers are the user's own), 0085 (a bot keeps the person's MCP servers, on their own word), 0066 (a bot asks the person with a card), 0047 (a secret goes to a masked form, not through the agent) and 0067 (what only the person's word changes).

## Context

The person wants their bot to act as a platform manager or personal assistant, so that "set up my Azure" is something a bot does, not only something it explains. A model provider is what every bot and thread runs on, and its API key is the most sensitive thing the person gives Aven.

If the key were an argument of a tool, it would be written by the person in the chat, sent to the model's provider as part of the conversation, kept in the bot's memory (which the chat is rebuilt from, and summarized from past a size) and shown to anyone the transcript reaches.

## Decision

- **A bot keeps the person's providers with `bot.provider`**: `list_providers`, `add_provider`, `update_provider`, `remove_provider` and `list_provider_models` (the models a provider offers, asked with its saved key). Any bot may look; adding, changing and removing take the person's own message, as MCP servers do (0085): not a note, not another bot, and not the main bot passing a request on.
- **No tool takes a key and no tool returns one.** A bot sees only whether a provider has a key (`hasKey`), not even its last characters. A provider a bot adds has none.
- **The key goes into a masked card, which saves it to the provider.** `ask_provider_key` puts a card in the bot's chat, a `BotQuestion` with a `providerKey`. The platform draws it as a password field, `PATCH`es the key to the provider through the person's own API session, and then sends the bot one ordinary message, "I saved the API key for X", which is what wakes it. The key is in no message, no bot memory and nothing the model reads. What the card says of the provider (its kind and address) is read from the person's own provider list, not from the bot's words. Like a question it is offered only where the person is there to type it: not for a note, and not for a bot answering another bot, though the main bot, the person's point of contact, may.
- **A provider that cannot run is never the default.** A provider that needs a key (everything but an OpenAI-compatible server, which may need none) and has none is not made the default when it is created, even as the person's first, and cannot be made the default until it has one (the person's own form has the same rule). A run that chooses one is refused with a message that says so, rather than falling back to the environment's key, which only a provider with none _of its own by design_ may use.
- **A provider a bot moves to another address forgets its key.** Listing a provider's models and running on it send its key to its address, so a bot that points a provider somewhere else would send the person's key there. A bot that changes the address must ask the person for the key again; a change that leaves the address alone keeps it. Any difference counts as a move, however small.
- **The person may do all of this by hand** at Settings > Providers, as before; a list open while a bot changes it is loaded again when the bot's reply ends.

## Consequences

- A person who pastes a key into the chat anyway has put it in the transcript: the bot's instructions say not to repeat or use it, and to tell them to use the form, but the text is already stored. The form is the way that keeps it out, not a guarantee against the person.
- A bot cannot make a provider run: without the key a provider does nothing, so a bot that adds a provider in the person's name costs nothing until they type a key into a card they can see.
- `bot.provider` is part of wire version 36, which has not been released, so no new version is needed; an older runner is refused until `aven update` as it already was for MCP.
- `models` asks the provider with the saved key at the address the provider has, from the control plane. The person can already do that from the platform; a bot can only on their own word for a provider they own.
- Deleting a provider deletes its key. The tool says so, and a bot is told to be sure that is what was asked.
