# Invite links and a registration toggle

Status: accepted

## Context

Teammates are invited through Better Auth's organization plugin. There is no email provider, and the platform owner needs to close sign-ups.

## Decision

- **Invite links, no email.** `inviteMember` creates the invitation row; the link is `/accept-invitation/<invitation id>`, built in the platform and copied to the clipboard (and from the Members list). The accept page asks the visitor to sign in or register, then calls `acceptInvitation` and switches into the organization. Better Auth requires the signed-in email to match the invited email.
- **Platform owners** are listed in `PLATFORM_OWNER_EMAILS` (`.env`). No schema change, and nobody can promote themselves.
- **Registration toggle** is the `registration_enabled` row in `platform_settings` (open when absent). Owners change it at Settings -> Platform (`PATCH /platform/settings`); `GET /platform/config` is public so the register page can show a closed notice.
- **Enforcement is server-side**, in a Better Auth `user.create.before` hook: when closed, only owners and emails with a pending, unexpired invitation can register. Invitees therefore bypass the toggle.

## Consequences

- Anyone holding the link can accept only if signed in as the invited email.
- Invitations expire after Better Auth's default (48h); links are not re-issued on expiry yet.
- Changing the owner list needs a restart.
