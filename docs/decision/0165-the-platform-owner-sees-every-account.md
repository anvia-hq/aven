# The platform owner sees every account

Status: accepted. Follows 0077 (the first account is the platform owner).

## Context

Settings > Members lists the people of one workspace. A platform owner, who runs the installation, could not see anyone who had registered but was in none of their workspaces, so an installation's accounts were invisible to the person responsible for it.

## Decision

- Settings > Platform has a People section for platform owners: every account in the order they were made, with its email, whether it owns the platform, the workspaces it belongs to with its role in each, and when it was last active (its newest session), or when it joined.
- It is `GET /platform/users`, refused with a 403 for anyone who is not a platform owner (`platformService.listPeople`, `isOwner`).
- It is a list only. Removing an account, changing roles and resetting access are not part of it: they are not asked for, and an owner removing someone from a workspace they are not in needs its own decision.

## Consequences

- An owner learns each person's email and workspace names, which the installation holds anyway and the owner could read from the database.
- "Last active" is a session's last update, not a record of use.
