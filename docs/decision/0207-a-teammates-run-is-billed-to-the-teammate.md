# A teammate's run is billed to the teammate

Status: accepted. Narrows 0179, which ran a driver's message on the creator's model, key and bill, and follows 0192, which already gave a teammate's run the teammate's GitHub.

## Context

0179 lent the creator's provider to every teammate who drove a thread, so the creator paid for what the team asked. 0192 split off GitHub and left the model and the bill as the creator's. A team that shares a thread expects each person to pay for what they ask the agent.

## Decision

- A run a teammate starts, or resumes by answering the agent's question, resolves its model from the teammate's providers: their default one, or one they choose. The key, and so the bill, is theirs.
- A teammate with no provider gets what a creator with none gets: the server's own default model, if there is one.
- A message that steers a run that is going keeps the model the run started with.
- The memory, skills, workspace and variables stay as 0179 set them. The creator's personal variables and MCP servers stay out of a teammate's run.

## Consequences

- The creator no longer pays for a teammate's runs.
- One run still has one model: a thread can alternate between the creator's and a teammate's models, message by message.
- The composer's note and the Share panel say so.
