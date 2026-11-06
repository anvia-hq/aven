# A workspace may have its own GitHub App

Status: proposed. Extends 0074 (the GitHub App is created from the platform) and 0044 (the agent acts as the person on GitHub); 0074's app becomes the default a workspace falls back to.

## Context

Today one GitHub App serves the whole server: a platform owner creates it (0074), its credentials live in `platform_settings`, and one `GithubClient` acts as it. Each workspace only connects an installation of it (`github_installations`), and each person connects their own account (`github_user_tokens`, one row per user).

That is right for one team on one server, and awkward for a server with workspaces whose repositories belong to different GitHub accounts:

- A private app installs only on the account that owns it, so a second workspace's GitHub organization needs the app to be public. A public app belongs to someone else's GitHub account, and its permissions are decided by the platform owner for every workspace.
- The app's private key can act on every installation. One leak reaches every workspace.
- A change to the app's permissions asks every workspace's GitHub admin to approve at once.

## Decision

- **A workspace may create its own app**, with the same App Manifest flow as 0074, from the workspace's settings, by an owner or an admin of the workspace. It is stored for that workspace with its credentials encrypted the same way (`PROVIDER_ENCRYPTION_KEY`), in a table of its own (`github_apps`, one row per organization), not in `platform_settings`.
- **A workspace without one uses the platform's app**, as now. A server with one team, and every install made before this decision, behave exactly as they do today. The environment's `GITHUB_APP_*` variables keep winning for the platform-level app (0074).
- **The app a workspace acts as is found from the workspace**: an organization's own app if it has one, else the platform's. `GithubClient` becomes a small set of clients by app (keyed by the app's id, each with its own installation tokens), picked with a `forOrganization(organizationId)` lookup, instead of one global that `configure` replaces.
- **An installation belongs to the app it was made for.** `github_installations` gets the app it is of (null for the platform's). `GET /github` gives the install URL of the workspace's own app, and `/github/callback` and the manifest callback check the `state`, which now names the workspace and the app, before attaching anything.
- **A person's connected account is per app**, since a user token is an app's, and one of another app does not work. `github_user_tokens` is unique on the person and the app, not on the person alone; a person in two workspaces with different apps connects once for each, and Connect GitHub says which app it is for. Rows that exist stay as the platform app's.
- **Moving a workspace to its own app does not move its projects.** Its installations of the platform's app stay until the workspace removes them; a project keeps reading through the installation it was imported with. Importing after the change uses the new app's installations.
- **Not done:** deleting or replacing an app from Aven (as 0074), webhooks, one app shared by chosen workspaces.

## Consequences

- A hosted or multi-organization server gets isolation of keys, permissions and approvals per workspace, and no longer needs a public app to serve organizations other than its owner's.
- Every GitHub call that today reaches the one client (`projects`, `ship`, `files`, repo access for runs, user connect and refresh) needs the workspace to pick the client. That is the bulk of the work.
- A migration adds `github_apps` and the two columns above; it only goes forward and is compatible with the previous release's code when the new columns are left null.
- A person in several workspaces may have several GitHub connections, and the Ship button and Connect GitHub have to say which.

## Order of work

1. This decision.
2. The client by app (`forOrganization`), with the platform's app as the only one, and every caller given the workspace. No behaviour change.
3. The schema: `github_apps`, the installation's app, the user token's app. Reads still fall back to the platform's.
4. Creating, showing and using a workspace's own app (settings, manifest flow and callbacks).
5. Connect GitHub and Ship per app, then the docs (`AGENTS.md`, the cloud guide).

Each step is its own commit and the server works after each.
