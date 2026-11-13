# 0269: The Context card shows the tokens in context when the model's window is unknown

Status: accepted. Builds on 0117 (the Context card) and the gateway model info of the providers.

## Decision

- A thread's context is `usedTokens` plus an optional `contextWindow`. Before, a model whose window the server could not learn (a gateway without `/model/info`, a model missing from the catalog) had no context at all: the card said "Shown after the agent's first reply" for the thread's whole life, and nothing was recorded.
- For such a model the run reports the input tokens of each model call as `usedTokens` with no window, and `usageFromHistory` reads the same from the last stored generation, so the number survives a refresh and navigation.
- The card then shows "N tokens in context" and "Model size unknown", with no percentage, bar or Compact button, as those need the window.
- A compaction run of a model with no known window reports no context: its call holds the old history, not the thread.

## Consequences

- The wire's `usage.context.contextWindow` is optional; older runners keep sending it.
- A Claude thread still gets its context when the run ends, as the window comes with the Claude result.
