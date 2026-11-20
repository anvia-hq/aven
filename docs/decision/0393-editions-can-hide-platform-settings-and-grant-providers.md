# Editions can hide in-app platform settings and grant model providers

Status: accepted.

## Context

Decision 0234 introduced the `Edition` seam so a private hosted edition (`aven-cloud`) can run on top of the open control plane without leaking commercial logic into the open repository.

For the hosted edition, operator settings (installation, sandbox configuration, people, announcements) move to a separate private admin console (`admin.aven.sh`), while self-hosted installations must keep those pages inside `Settings > Platform` exactly as before. The hosted edition also needs to grant managed model providers to users or workspaces without exposing raw API keys or letting end users edit or delete them.

## Decision

- **`Edition.hidePlatformSettings`**: an optional boolean (default `false` in `communityEdition`). `GET /platform/config` returns `platformSettings: !editionInUse.current.hidePlatformSettings`. When `false`, `apps/platform` hides the `Platform` sidebar group and redirects `/settings/{platform,sandbox,people,announcements}` to `/settings/general`. The `/platform/*` API endpoints stay mounted so both the self-hosted UI and an external admin console use the same backend.
- **`Edition.providers`**: an optional `{ list(userId), find(userId, id) }` hook returning `GrantedProvider` records (with encrypted keys and optional `allowedModels`). `providersService` merges granted providers into `list`, `listModels`, `forRun`, and `forNativeRun` with `managed: true`, enforces `allowedModels` in `resolveModel`, and leaves `update` and `remove` scoped strictly to user-owned rows.
- **No foreign key on `threads.model_provider_id` or `bots.provider_id`**: dropped so threads and bots can persist edition-managed provider IDs while `providersService.remove` nulls references when a user deletes one of their own providers.
- **Read-only UI treatment**: `apps/platform` displays a `Managed` badge on granted providers, hides edit/delete/default actions, and does not let a managed provider block a user from connecting their own credential of the same kind.

## Consequences

- Self-hosted installs (`communityEdition`) behave identically to before.
- The hosted edition can operate a separate admin console, manage sandbox allowlists through `Edition.admit`, and grant hosted model providers through `Edition.providers` without duplicating control-plane logic.
