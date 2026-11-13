# 0279: Shared code moves from the apps into packages

Status: accepted.

## Context

Generic code sat inside the apps: the runner wire schemas and a GitHub REST client in the control plane, its small utilities, and about sixty vendored UI components in the platform. Only the apps could use it, and `AGENTS.md` says shared code goes in `packages/`.

## Decision

- **The runner wire schemas live in `@aven/protocol`.**
- **`@aven/server-kit` holds the control plane's generic utilities** (crypto, bytes, errors, origin guard, attachments).
- **`@aven/github` holds the GitHub REST client.** The database-bound GitHub code stays in the control plane.
- **`@aven/ui` holds the vendored UI components** and their hooks. App-specific components stay in `apps/platform/src/components/`.
- Nothing else changed: these are moves and import rewrites. The release and version logic in the CLI and control plane was left where it is.

## Consequences

- A second app can use the same wire, client and components.
- New packages must be listed in the Dockerfiles' `COPY` lines.
- Imports of the moved components are now `@aven/ui/<name>`.
