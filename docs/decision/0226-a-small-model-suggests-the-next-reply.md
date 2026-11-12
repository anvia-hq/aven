# A small model suggests the next reply, and a fork shows as a card

Status: accepted.

## Context

After the agent answers, the person usually types one of two or three obvious next steps. A small, cheap model can offer them as buttons. Separately, a fork thread was shown in its parent's transcript as a plain tool line, which says nothing about whether the fork is working, what it was asked, or who owns it.

## Decision

- **Follow-up suggestions are a personal setting**, in Settings > General > Small models: a switch (off by default) and one provider and model, kept in `user_settings` (`follow_ups_enabled`, `follow_ups_provider_id`, `follow_ups_model_id`). It uses the person's own provider and key through `resolveModel`, so nothing new holds a key, and it differs from the decision model (0191), which is a workspace setting with its own key.
- **The server makes one call per finished reply**: `POST /threads/:id/follow-ups` (for anyone who may drive the thread) reads the end of the conversation, and only when the agent spoke last asks the model, with `extract` and a schema of one to three short replies. A missing setting, a timeout or any failure returns no suggestions and is logged; a suggestion is never worth a toast.
- **Nothing is stored.** The page asks when a new assistant message has settled that was not there when the thread opened (so opening an old thread costs no call), shows the buttons above the composer, and drops them when a run starts or one is pressed.
- **Pressing a button sends its text** as the next message with the thread's model selection, like typing it.
- **A finished `fork_thread` call is a card** in the parent: the fork's title, its state (Working, Idle or Archived) and task, its age and its creator, linking to the fork. `fork_thread` now has a one-line task as its `target`; the card takes the rest from the thread list. No wire change.

## Not done

- The small model is not used for anything else yet (titles, summaries).
- Suggestions are not kept: reloading the page loses them.
