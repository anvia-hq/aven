# A server may give every workspace a decision model

Status: accepted. Extends 0191 (the decision model) and 0238 (it gates the follow-up suggestions).

## Context

The decision model is one per workspace, set by an owner or an admin with their own key (0191). A hosted server, or any server whose operator pays for it, wants every workspace to have one without each setting it up: until a workspace sets one, multiplayer cannot be turned on and the follow-up gate has nothing to ask.

## Decision

- **A server may set a default** with `DECISION_MODEL_API_KEY`, and optionally `DECISION_MODEL_KIND` (`jev` or `jev-openrouter`, the default) and `DECISION_MODEL_ID` (the kind's model when empty). Without a key there is no default and nothing changes.
- **A workspace's own decision model wins.** With none of its own, a workspace uses the server's: multiplayer can be turned on, and the follow-up gate runs. Removing the workspace's own falls back to the server's.
- **The key never leaves the server.** The settings page learns only that the model is `source: "server"`, with its provider and model, and shows "Provided by this server"; an owner or an admin can still set one of their own.
- **A kind the server does not know stops it starting**, and so does nothing else about the default: a missing key is not an error.

## Consequences

- The operator pays for every workspace's decision calls: one per multiplayer message, and one per reply of 40 characters or more for the follow-up gate (0238). They are short, and there is no spending limit; one should come before an install that strangers can sign up to depends on this.
- The environment holds a secret beyond the install's own, so it is listed only in the env templates, never in an image.
- A workspace that wants its messages kept from the operator's provider sets its own.
