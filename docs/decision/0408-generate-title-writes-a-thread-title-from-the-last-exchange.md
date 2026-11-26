# Generate title writes a thread title from the last exchange

Status: accepted.

## Context

A thread is named after its project until its owner renames it by hand, so most threads carry the same name and are hard to tell apart in the sidebar.

## Decision

- The thread options menu has Generate title (owner only). It calls `POST /threads/:id/title`, which reads the thread's history, takes the latest user message and the agent's reply that follows it (text parts only, cut to 1,500 and 2,500 characters), and asks a model for a title of two to six words in the person's language (`threads/title.ts`). The model is the server's small model when one is set (the one the run narrator uses), and otherwise the person's own default provider and model, the big one, so it works with no extra setup.
- The title is cleaned (quotes, a `Title:` prefix and trailing dots dropped) and saved through the normal thread update, so it follows the same rules as a rename.
- It does not block the screen: the menu closes, a toast says "Writing a title…" and turns into "Title updated" with the new title, or into the reason it failed. The call has a 15 second limit.
- A thread with no user message ("There is nothing to title yet") or a person with neither a small model on the server nor a provider of their own ("Add a provider or set a small model in settings…") answers 422 with that message.

## Consequences

Generating again replaces the title, including one set by hand. Nothing is stored beyond the title, and a thread's text is sent to the model only when its owner asks.
