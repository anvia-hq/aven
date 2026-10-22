# Projects, settings, activity and navigation (mock UI)

Status: mock only, no backend. Builds on `0001-threads-mock-ui.md`.

## Sidebar

Shaped after the Amp web app, not copied.

- **Top:** sidebar toggle, brand, theme toggle, search (opens the command palette), **New +**.
- **Thread groups:** Recent (open, touched in the last 24h), Earlier, Snoozed, Archived. Each group is collapsible and shows a count. Snoozed and archived start collapsed.
- **Bottom:** a "What's new" card, a tab bar (Threads, Activity, Projects, Dashboard) and the user row.
- **User row:** opens a menu with Personal settings (⌘,), Workspace settings, Command palette (⌘K), Report a bug, Sign out.
- When collapsed, the sidebar keeps only the icon controls and the tab icons.

## Command palette

⌘K / Ctrl+K, or the search button. Jumps to pages, threads and projects. Typing `project <name>` ranks projects first.

## Threads

Threads have a state: open, snoozed or archived. The thread header has **Snooze** and **Archive** (or **Reopen** when not open). Threads belong to a project.

## Projects

- `/projects`: card grid with All / Active / Archived tabs and **New project** (name, repo).
- `/projects/$projectId`: breadcrumb (Projects / owner / repo), description, a prompt box that starts a thread in that project, Recent threads, Commits to the default branch (with CI status), a Files table with the last commit per entry, and Archive / Restore.

## Activity

`/activity`: feed of thread, commit and team events with All / Threads / Commits / Team filters.

## Settings

Two scopes, one layout at `/settings/*`.

| Scope     | Page         | What it does                                                         |
| --------- | ------------ | -------------------------------------------------------------------- |
| Personal  | Profile      | Name, read-only email, dark mode switch, default mode, danger zone   |
| Personal  | API keys     | Create (secret shown once, copy button) and revoke                   |
| Workspace | Members      | Invite (email + role), pending status, remove                        |
| Workspace | Usage        | 7 / 30 day range, totals, daily token bars, usage by mode            |
| Workspace | Integrations | Switches for GitHub, Slack, Linear, Sentry, Postgres and Browser MCP |

Toasts confirm saves, invites, key actions and archive/restore.

## Mock data

All state lives in jotai atoms under `modules/*/atoms/` and resets on reload: `projectsAtom`, `threadsAtom`, `membersAtom`, `apiKeysAtom`, `integrationsAtom`, `usageAtom`, `activityAtom`.

## Not built

Real persistence, real git data, billing, SSO, notification settings, per-project settings, file viewer.
