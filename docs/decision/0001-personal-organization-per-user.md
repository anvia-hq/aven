# Personal organization per user

Status: accepted

## Context

Every user works inside an organization. Better Auth's `organization` plugin provides the tables and APIs (`organization`, `member`, `invitation`, and `session.activeOrganizationId`), but it does not create an organization for a new user. Without one, a fresh user has no active organization and every org-scoped feature needs a separate "create your first org" step.

## Decision

- Enable Better Auth's `organization()` plugin in `apps/control-plane/src/modules/auth/service.ts`, with its tables in `packages/db/src/schema/` (`organizations`, `members`, `invitations`) and `sessions.active_organization_id`.
- Each user gets a personal organization with id and slug `personal-<userId>`, where the user is `owner`.
- The personal organization is created in `databaseHooks.session.create.before`, and the new session's `activeOrganizationId` is set to it.

## Options considered

- **`user.create.after` hook.** Rejected. Better Auth runs `after` hooks once the transaction ends, which is after the sign-up session is created. The first session then has no active organization.
- **Random org ids.** Rejected. Two concurrent sign-ins could create two personal orgs. A derived id with `onConflictDoNothing` makes creation idempotent.
- **Create the org in the app's sign-up route.** Rejected. Email sign-up is not the only way a user is created, and the hook covers every session.

## Consequences

- Every session start runs two idempotent inserts. Cheap, but it is a write on each sign-in.
- Users who signed up before this change get their personal org on their next sign-in.
- Membership is not removed when a user leaves the personal org. Treat it as the user's default, not as a permanent constraint.
