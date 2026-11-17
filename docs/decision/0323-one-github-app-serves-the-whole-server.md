# One GitHub App serves the whole server

Status: accepted. Supersedes 0123 (a workspace may have its own GitHub App). 0074 (the platform creates the app) and 0044 (the agent acts as the person on GitHub) stand as they were.

## Context

0123 let a workspace make a GitHub App of its own, kept in `github_apps`, so a server's workspaces could have their keys, permissions and approvals apart. It cost a set of clients by app, an app key on every installation and every person's connection, and a second path through the manifest flow, Connect GitHub and Ship, for a case no one has asked for since: a server is one team's, and its one app, made by the platform owner, has been enough.

## Decision

- **There is one GitHub App, the platform's.** The platform owner creates it with the manifest flow of 0074 and it is kept encrypted in `platform_settings` under `github_app`; the environment's `GITHUB_APP_*` variables still win. A workspace cannot make an app, and `scope=workspace`, `github_apps` and the per-app clients (`forKey`, `forOrganization`, `forget`) are gone: the control plane uses the one `GithubClient`.
- **A person's connected account is one per person.** `github_user_tokens` is unique on `user_id` alone and has no `app_key`; Connect GitHub and Ship do not say which app.
- **An installation belongs to the one app.** `github_installations` has no `app_id`. The setup `state` carries only the person and the time, signed, and expires after an hour; the install `state` names the workspace and the person as before, with no app.
- **The API loses the app's name.** `GET /github` gives `configured`, `installUrl` and `canSetUp`; `GET /github/user` gives `connected` and `login`; `GET /threads/:id/ship` has no `appKey`; `/github/connect` and `/github/user` take no `app`.
- **Settings > GitHub** says whether GitHub is set up and lets the person install the app on an account and connect their own; creating the app stays in Settings > Platform.

## Consequences

- The migration (`0079_drop_workspace_github_apps`) deletes what a workspace's own app left, since nothing can use it any more: it clears `projects.github_installation_id` of the projects that point at an installation of such an app, deletes those installations and the connections whose `app_key` is not `platform`, and then drops `github_apps`, `github_installations.app_id` and `github_user_tokens.app_key` and makes `github_user_tokens` unique on `user_id`. Those projects stay, with no GitHub installation, and a person whose connection was deleted connects once more.
- It only goes forward. A release before this one reads a table and columns that are gone, so rolling back means restoring a backup taken before the migration.
- A server that never used 0123 behaves exactly as before.
