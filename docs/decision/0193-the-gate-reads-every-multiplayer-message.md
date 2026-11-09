# The gate reads every multiplayer message

Status: accepted. Narrows 0191, which read only a message that mentions a person.

## Context

0191 asked the decision model only about a message with an `@` mention of a person. A person who mentioned a teammate and then kept talking to them without repeating the mention sent a message that went straight to the agent, which answered a conversation it was not part of.

## Decision

- In a thread with multiplayer on, the gate reads every message without files, while the agent is idle (0191). A mention is no longer needed.
- The model is shown who wrote each of the last four messages, by name, with mentions as plain `@Name` and without the `[driver: …]` mark, and the people in them count as participants. This is how it can tell that a message continues a talk between two people.
- The question about a person is no longer limited to the mentioned teammates: it asks whether the author is talking to someone in the thread, mentioned or already in the recent talk, and waiting for them.
- `@agent` in a message sends it to the agent without asking the model.
- The fallback when the model is missing, fails or is slow is unchanged: a mention is for the person unless `@agent`; a message with none is for the agent.
- `@` in the composer of a multiplayer thread offers `agent` first, before the teammates, and writes `@agent`.
- The agent's instructions say that a thread can have several people, what the `[driver: Name]` mark is, that a message for a teammate may sit in the history with no answer from it, and that `@agent` means it. Until now it was never told.
- User messages in a thread use the margins of a plain chat (`my-6`), since in a thread of several people the larger gap read as empty space.

## Consequences

- Each multiplayer message costs one call to the model, bounded by the three-second timeout, and a slow or failed call lets the agent answer as before.
- A message meant for the agent can be judged as for a person. It stays in the thread with no sign that the agent skipped it, and saying it again with `@agent` runs it.
- The recent messages go to the model's provider, as 0191 already said, now with every message rather than only those with a mention.
