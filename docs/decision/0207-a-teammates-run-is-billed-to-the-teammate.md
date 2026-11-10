# A teammate's run is billed to the teammate

Status: accepted. Narrows 0179, which ran a driver's message on the creator's model, key and bill, and follows 0192, which already gave a teammate's run the teammate's GitHub.

## Context

0179 followed Amp, where the thread owner is billed for every agent and orb cost of a multiplayer thread, a teammate's prompts included. Amp's pages do not say whose model key or Claude plan a teammate's prompt uses. In Aven a provider is an API key, and a teammate who joins a thread expects to pay for what they ask the agent, not to run up the creator's bill for a week.

## Decision

- A run a teammate starts, or resumes by answering the agent's question, resolves its model from the teammate's providers: their default one, or one they choose. The key, and so the bill, is theirs.
- A teammate with no provider gets what a creator with none gets: the server's own default model, if there is one.
- A message that steers a run that is going keeps the model the run started with.
- The memory, skills, workspace and variables stay as 0179 set them. The creator's personal variables and MCP servers stay out of a teammate's run.
- The composer's note and the Share panel say so.

## Consequences

- The creator no longer pays for a teammate's runs.
- One run has one model: a thread can alternate between the creator's and a teammate's models, message by message.
- Subscription sign-in for Claude or Codex is later work. When it comes, a teammate's run would use the teammate's own login, as it does for GitHub in 0192.
