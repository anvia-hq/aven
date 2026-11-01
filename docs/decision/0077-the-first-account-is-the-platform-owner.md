# The first account is the platform owner

Status: accepted. Extends 0002, which listed the owners in `PLATFORM_OWNER_EMAILS` only.

## Context

A self-hosted install is set up by one person, who opens the page and registers. Owning the platform (Settings > Platform: opening and closing sign-ups, creating the GitHub App) meant knowing to put an email in `PLATFORM_OWNER_EMAILS` first, and an install made without it had no owner at all.

## Decision

- The platform owner is the **first account made on the installation** (the earliest `users.created_at`, ties by id), or anyone listed in `PLATFORM_OWNER_EMAILS`. The list stays for more owners and for an owner who must hold the role before registering (`aven install --owner-email`).
- It is **read, not stored** (`platformService.isOwner(person)` asks for the earliest user). An install that already has people needs no backfill and keeps its first account as the owner, two sign-ups at once cannot both claim it, and nothing can be promoted from the outside.
- `isOwner` takes the person, not only the email, so the owner check is async (`app-setup.ts`, `github/router.ts`). Registration while closed still admits listed owners only: an account that does not exist yet cannot be the first.

## Consequences

- On an open install the first visitor to register owns it. An installer that exposes the address before its person has registered should close registration or list the owner with `--owner-email`.
- If the first account is deleted, the next earliest becomes the owner.
- There is no way yet to hand the role to another account without listing their email.
