# A thread keeps the model it runs on

Status: accepted. Adds to 0123 and 0274; changes how a message with no provider is resolved.

## Context

A thread never recorded which provider and model it ran on. The composer kept the choice in the browser (`aven.model-selection.threads`), and when it had none it showed the provider marked default. A message with no `providerId` was resolved on the server to the default too (`forNativeRun`). So making another provider the default, in Settings, moved every thread that had no saved choice in that browser to the new provider on its next message. One thread went from Claude Sonnet to a DeepSeek gateway mid-conversation: the Anthropic cache stopped being written, and the cost and context window changed with no sign of it.

The default is meant for new threads only.

## Decision

- **A thread stores its choice.** `threads.model_provider_id` (references `providers`, set null on delete), `threads.model_id` and `threads.reasoning_effort`. They are written when a run starts, whether from a message, a compaction or an answer (`threadsService.rememberModel`), and only when they changed.
- **A message with no provider uses the thread's choice.** `selectionForRun` takes what the message asks for, else the thread's stored provider with the message's model and effort laid over it, else (a native thread that never chose) the default of that moment, and the thread then keeps that one. Another person's provider, or one that was deleted, is dropped as before and the default stands in for that run.
- **The composer starts from the thread.** For an existing thread the order is the pick made in this browser, then the thread's stored choice, then the default. The last pick overall (`aven.model-selection`) seeds new threads only.
- **Making a provider the default changes nothing for a thread that has run.** It decides the provider of the next new thread, and of a thread that has not run yet.

## Not done

- Threads that ran before this change have no stored choice. They are pinned to the default at their next message, which is the old behavior once. They are not filled in from their last run.
- A pick made in this browser still wins over the thread's stored choice until the thread is sent from it, so a second browser that picked earlier can show an older choice.
