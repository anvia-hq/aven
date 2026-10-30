# The model choice is kept per thread

Status: accepted. Refines where [0007](0007-model-and-effort-chosen-per-message.md) keeps the composer's choice; the choice is still sent with each message and still only a preference.

## Context

The composer's provider, model and effort were one value in the browser (`aven.model-selection`), shared by every composer. Picking DeepSeek in one thread switched every other thread to DeepSeek on its next message.

## Decision

- Each thread keeps its own choice in `aven.model-selection.threads` (thread id to `{ providerId, modelId, effort }`, `modules/threads/atoms/model-selection-atom.ts`). A thread's composer and question form read it through `useModelSelection(threadId)`.
- `aven.model-selection` stays as the last choice made anywhere: what a new thread starts with, and what a thread with no choice of its own uses (threads from before this change, until one is made).
- A thread's entry is saved when a model or effort is picked in it, when the thread is started, and when a message is sent in it (`rememberModelSelection`), so a choice made elsewhere never moves it.
- At most 200 threads are remembered; the least recently used are forgotten. Sign-out clears both keys.

## Consequences

- A thread forgotten past the limit, or opened in another browser, falls back to the last choice.
- `e2e/composer.spec.ts` checks that two threads keep different models and that a new thread starts from the last one picked.
