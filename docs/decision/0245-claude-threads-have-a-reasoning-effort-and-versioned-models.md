# Claude threads have a reasoning effort and versioned model names

Status: accepted. Extends 0242 and 0244.

## Context

The Claude entries in the model menu were four fixed names with no reasoning control, and a name such as "Sonnet" did not say which model it was. The SDK lists five aliases (`default`, `sonnet`, `opus`, `fable`, `haiku`), says which model each resolves to (`claude-sonnet-5-5`), and offers the same five effort levels for all of them: low, medium, high, xhigh and max. Aven passed only the model.

## Decision

- **The table is in `@aven/protocol/claude-models`**: the aliases, the model each resolves to, the effort levels and the default effort (medium, the native agent's fallback too). A name shows the version, "Sonnet 5.5", and the menu trigger reads "Claude Sonnet 5.5" with the effort beside it, like a native model.
- **Haiku is added.** The default entry reads "Default · Sonnet 5.5".
- **The table is kept in step with the SDK by a test.** `claude-models.test.ts` in runtime-client asks the SDK for its models and fails when an alias resolves to another version or offers other effort levels, so an SDK upgrade cannot leave a wrong name.
- **Effort is sent as `claudeEffort`**, beside `claudeModel` on `run.start` and `run.resume`. It is optional, so the wire version is unchanged and an older runner ignores it. The control plane forwards only a known level, and the runner passes it to the SDK as `effort`. The effort slider of the native menu is used for Claude models.
- **The menu inside a Claude thread is the same component**, restricted to the Claude models, so the old Claude-only select is gone.
- **Prompt caching** is the SDK's own and stays on. The system prompt now sets `excludeDynamicSections`, which moves the working directory and git status out of the cacheable system prompt and into the first user message, so threads of one person can share the cache prefix. Aven's own text stays in `append`. The SDK records the system prompt on a thread's first request and reuses it on later ones, so memory notes saved mid-thread reach the model after compaction or in a new thread.

## Consequences

- A person can set the reasoning of a Claude thread per message, and the model is named with its version.
- A new alias or version is one edit of the table, and the test says when it is due.
- The effort sent is always one of the five; the SDK may lower it silently for a model that does not support the level.
