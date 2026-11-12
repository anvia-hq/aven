# The platform owner sets the server's default models in the UI

Status: accepted. Extends 0240 and 0241, and follows 0074 for where a platform secret is kept.

## Context

0240 and 0241 let a server give the decision model and the small model to everyone, but only through environment variables. On a hosted server that means an SSH session, an edit and a restart for every change, and the owner cannot see what is set.

## Decision

- **Settings > Platform has a "Server defaults" section**, for platform owners only, with the decision model (provider, model, key) and the small model (provider, model, key).
- **They are stored in `platform_settings`**, one JSON value per model under `server_decision_model` and `server_small_model`, with the key encrypted by `PROVIDER_ENCRYPTION_KEY`. No migration: the table is key-value.
- **The environment wins.** When `DECISION_MODEL_API_KEY` or `SMALL_MODEL_API_KEY` is set, it is the default and the section shows it as set in the server's environment. Saving or removing here is refused then, so there is never a saved value that does nothing. Installs that use the environment behave as before.
- **A change applies at once.** Each request reads the default, so no restart is needed.
- **The key never leaves the server.** The owner's view carries the provider, the model and the last four characters of the key.
- **Email sign-in stays an environment setting.** Turning it off from the page you are signed in to could lock the owner out.
- **Precedence is unchanged:** a workspace's own decision model and a person's own provider still win over the default.

## Consequences

- The default models cost the operator money with no cap; the section says so.
- The owner can change or remove a default in seconds, which also removes it from everyone who relied on it.
- One more secret sits in the database, protected the same way as providers' and the GitHub App's keys.
