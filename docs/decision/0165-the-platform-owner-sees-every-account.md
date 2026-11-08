# The platform owner sees every account and can remove one

Status: accepted. Follows 0077 (the first account is the platform owner).

## Context

Settings > Members lists the people of one workspace. A platform owner, who runs the installation, could not see anyone who had registered but was in none of their workspaces, so an installation's accounts were invisible to the person responsible for it.

## Decision

- Settings > People, an entry of its own under Platform in the settings menu, is for platform owners: every account in the order they were made, with its email, whether it owns the platform, the workspaces it belongs to with its role in each, and when it was last active (its newest session), or when it joined.
- It is `GET /platform/users`, refused with a 403 for anyone who is not a platform owner (`platformService.listPeople`, `isOwner`).
- A platform owner can remove an account (`DELETE /platform/users/:id`, `platformService.removePerson`), behind a confirmation. It is refused for the owner's own account, for a platform owner, for a person who owns a workspace that has other members (their workspace must be handed over or emptied first), for an account that does not exist, and for a person whose removal would take something other people use: a project they imported that has other people's threads, a runner they added that other people's projects or threads run on, or a GitHub account they connected that other people's projects use. The database would delete the project and those threads with them, or refuse and fail, so the owner is told what to move first.
- Removing deletes the account and, through the database's cascades, what is only theirs: threads, projects they imported, bots, providers, skills, memory, cockpit records, runners they added and their sessions. A workspace they are alone in is deleted with them, while in a shared workspace the others keep it. Their threads that were not archived are put away first, so runs stop and sandboxes are freed (decision 0118).
- Changing roles and resetting access are still not part of it.

## Consequences

- An owner learns each person's email and workspace names, which the installation holds anyway and the owner could read from the database.
- "Last active" is a session's last update, not a record of use.
- Removing cannot be undone. Files a runner keeps for a removed person's threads are left to the runner's own cleanup, and a bot of theirs that was mid-reply may finish it.
