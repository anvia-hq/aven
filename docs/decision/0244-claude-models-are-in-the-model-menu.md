# Claude models are in the model menu

Status: accepted. Refines 0242, which ran a thread on the Claude Agent SDK and chose it with a separate Agent select next to the model menu.

## Context

A new thread's prompt had an Agent select (Aven or Claude) beside the model menu. Two controls answered one question, which model runs this thread, and a person had to know that choosing Claude replaced the model menu with another.

## Decision

- **There is one model menu.** Its last group, "Claude subscription · Agent SDK", lists Default, Sonnet, Opus and Fable. Choosing one starts the thread on the Claude Agent SDK with that model; choosing any other model starts it on Aven's own agent. The trigger reads "Claude Sonnet" for a Claude choice.
- **The Agent select is gone.** The backend is still fixed when a thread is created, so it follows from the choice at that moment and is sent as before.
- **A thread keeps its backend.** Inside a Claude thread the menu offers only the Claude models, and inside a native thread only the person's own, since a thread cannot change backend.
- **A person with no provider can still pick Claude.** The menu opens on the list instead of asking them to add a provider.
- **The Claude settings page says what it is:** threads on Anthropic's Claude Agent SDK with the person's own Claude subscription, chosen from the model menu.

## Consequences

- No wire, API or database change; only how the client chooses the backend.
- The Claude entries are a fixed list in the client (the SDK's aliases), not part of a provider's catalog, so they do not appear in the small-model or bot pickers.
