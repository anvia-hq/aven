# 0311 — The Aven Cloud sandbox server is a platform setting

- **Status:** accepted
- **Date:** 2026-11-16

## Context

A spaces server is named by four environment variables (`AVEN_SPACES_API_BASE`,
`AVEN_SPACES_API_KEY`, `AVEN_SPACES_RUNNER_URL` and `AVEN_CLOUD_PROVIDERS`, decision 0306). A
person running Aven on their own machine can only change them by editing `.env` and restarting the
control plane, and an API key ends up in a file that is easy to leak and hard to rotate.

Other things the whole installation shares are already settings a platform owner edits in the app:
the default models (decision 0243) and the GitHub App (decision 0074) are in `platform_settings`,
and a section of Settings > Platform edits them. Which is the same shape of value: an address and a
secret that belong to the installation, not to a workspace or a person.

## Decision

Settings > Platform has an **Aven Cloud sandbox** section: the spaces server's address, the address
a sandbox dials, and the server's API key. `cloudSettingsService` keeps them in `platform_settings`
under `spaces_settings`, the key encrypted with `PROVIDER_ENCRYPTION_KEY`, and returns only its last
four characters. `GET/PUT/DELETE /platform/cloud` are the platform owner's.

- `apply()` reads the row and hands the sandbox package its settings (`setSpacesSettings` of
  `sandbox/src/spaces/config.ts`); the provider, the wake flow and the expiry sweep then read them
  instead of the environment. It runs at start, before the cloud templates are made, and after every
  save or removal, so a change needs no restart.
- A saved row also offers its provider (`offerCloudProviders`), so `AVEN_CLOUD_PROVIDERS` may be
  left out entirely: a spaces server given in the app is offered by itself. Naming a provider in the
  environment still works and still keeps the others off.
- The environment wins where it is set, as the default models do: a server configured by
  `AVEN_SPACES_*` shows the section read-only and refuses a save with a `409` naming the variable.
  That keeps an installed server's `.env` the source of truth for what it is deployed with.
- `AVEN_SPACES_AUTO_STOP_SECONDS` stays an environment variable: it is an operator's tuning, not a
  credential.

## Consequences

- Setting up Aven Cloud on a machine Aven does not deploy is a form, not a rebuild.
- The key lives encrypted in the database rather than in `.env`; rotating it is editing the form.
- Two sources of the same value would be confusing, hence the refusal rather than a merge: a key in
  both places is one the person cannot tell the server which of it uses.
- The sandbox package keeps no storage of its own: it is given the settings by the control plane, as
  it is given the database for its records (decision 0307).
