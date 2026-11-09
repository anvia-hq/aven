# 0191: A decision model tells whether a multiplayer message is for the agent

Status: accepted. Builds on 0179 (teammates drive a thread while multiplayer is on).

## Context

With multiplayer on, every message a teammate or the creator sends starts an agent run on the
creator's model and bill. People also talk to each other in the thread ("@Randy did you deploy
the fix?"), and a run for that wastes the bill and answers a question nobody asked it.

## Decision

- **Mention a teammate with `@`.** In a multiplayer thread the `@` list offers the workspace's
  members, with avatar and name, before the files. A pick is written into the prompt as
  `@[Name](user:<id>)` and shown as a chip in the composer and as `@Name` in the sent message.
  Outside multiplayer nothing changes.
- **A gate reads the message before anything runs.** It applies only to a thread whose
  multiplayer is on, to a message with a person mention and no files. Anything else goes to the
  agent as before, without asking the model.
- **The gate is a decision model, not a chat model.** A decision model (Jev, through
  `@anvia/jev` and core's `decide()`) answers typed questions with probabilities and writes no
  text. The gate asks two yes/no questions over the message, its author, the mentioned people
  and the last few messages: is the author asking the agent, and is the author talking to a
  mentioned teammate. The agent stays out only when the second is at least 0.6 and the first at
  most 0.4; every other answer, including both high, lets the agent act, because a silent agent
  costs more than an extra reply.
- **A message that is not for the agent is kept, not run.** It is appended to the thread's
  history as a user message (a later run loads it with the rest of the history) and shown to
  whoever watches an idle thread. While a run is working, it is stored but watchers see it on
  their next load, as the run holds its own copy of the conversation.
- **The decision model belongs to the workspace and is required.** One per workspace, set by an
  owner or an admin in settings (Jev directly or through OpenRouter, a model id and a key kept
  encrypted like a provider's). Multiplayer cannot be turned on until it is set; a thread that
  already has multiplayer keeps working when it is removed.
- **A deterministic fallback decides whenever the model cannot**: none is set, its key cannot be
  read, the call fails, or it takes longer than three seconds. A message with a mention is for a
  person unless its words name the agent (`@agent`), and a message without a mention is for the
  agent.
- **Jev through OpenRouter** is the call to
  `https://openrouter.ai/api/v1/systemone` with the SDK's `baseURL`; on Bun it needs the
  workaround in `docs/bugs/0005`.

## Consequences

- A person who mentions a teammate and the agent in one message, without `@agent` and without
  the model, is judged by the fallback as being for the teammate. The model handles it better,
  which is why it is required.
- A message the model gets wrong costs one retry: the person says it again with `@agent`, or
  without the mention.
- The first slice adds no sign in the thread that the agent skipped a message.
- Migrations and decision numbers collide with open pull requests; renumber on merge.
