# A failed run says why to a client that comes later

Status: accepted. Builds on 0008 (runs belong to the server) and 0076 (what a failed run files).

## Context

A run that fails, such as one whose model provider keeps answering `404 This model is not available` or `500 The model is unavailable` past its retries, ends with an `error` event. That event reached only the clients attached when it happened, and the platform kept it in the page's memory. A person who sent a message and came back later, or reloaded, saw their message and nothing under it: no reply and no reason. On a self-hosted install this happened with a staging model gateway that failed intermittently; the run had worked for six minutes before one model call ran out of retries.

## Decision

- **The control plane keeps why the latest run failed**, in `threads.last_error` (a nullable text column), set when a run ends with `error` and cleared when the next run starts. Cancelling is not a failure and sets nothing. Writing it does not change the thread's `updated_at`.
- **The snapshot says it**: `GET /threads/:id/events` gives `error` in its first message while no run has started since. `RunManager` knows it in memory for a thread it has run, and reads the column for one it has not, as after a restart; a column that cannot be read or written costs only that, with a warning, never the run.
- **Clients show it as they show a live `error`**: the platform sets its error from the snapshot, where the reply would be. The native client contract (`docs/products/0004-native-client-contract.md`) says the same.

## Consequences

- One migration, a column added, which the previous release's code ignores.
- The message is the one the run ended with, cut to 300 characters as before, so a provider's own words ("This model is not available") reach the person.
- What a failed run had done before it failed is still filed as decision 0076 says: the prompt, and for a turn limit the whole conversation. Keeping more of it is a separate change.
