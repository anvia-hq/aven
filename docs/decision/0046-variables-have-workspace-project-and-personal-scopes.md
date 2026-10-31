# Environment variables have workspace, project and personal scopes

Status: accepted. Extends 0045, which gave a project its variables. Follows Amp's "Handling secrets and environment variables", where a value is set for a workspace, a project or a person, and the nearest wins.

## Context

0045 has one scope, the project. A key several projects share (a registry token, a cloud region) has to be entered in each, and a person's own key (their personal API token) cannot be set without every member of the project getting it.

## Decision

- **Three scopes.** _Workspace_: every thread of the organization. _Project_: the threads of one project (0045). _Personal_: one person's own threads, in one organization.
- **Precedence is by name, nearest first**: personal over project over workspace. A run gets the three merged, and the merge is made by the control plane when a message starts or answers a run, so the runner and the wire (`env`) do not change.
- **Who changes what.** A workspace value: an owner or an admin of the organization. A project value: any member, as in 0045. A personal value: the person; no one else can read or change it, not even an owner. A person's values are used only for runs they send.
- **Personal is per person and per organization**, not global like a provider: a runner belongs to an organization and is handed the secrets of the runs it executes, so a person's personal secrets must not reach another organization's runner.
- **One table.** `environment_variables` replaces `project_variables`: `organization_id` always, and at most one of `project_id` (project scope) and `user_id` (personal scope), neither for workspace scope. A name is unique within its scope. The rows of `project_variables` are copied in the migration that creates it.
- **Everything else of 0045 holds for every scope**: encryption, write-only secrets and their hint, the name and size rules and the reserved names, the limit of 100 per scope, redaction of the merged secrets, and the names (never values) in the agent's instructions.
- **API**: a project's stay at `/projects/:id/variables`; workspace at `/variables/workspace`; personal at `/variables/personal`; each with `GET /`, `PUT /:name` and `DELETE /:name`. Each answers with that scope's own values only; the merge exists only for runs.
- **Settings**: Personal has an "Environment variables" page, Workspace has one, and a project's page keeps its own. A project's page also lists the names it inherits, and which scope each comes from, so a value set elsewhere is not a surprise.

## Consequences

- A workspace secret reaches every member's runs, as a project's reaches every member of the project; an owner or admin should put there only what every member may use.
- Overriding is by name only: a personal value of an existing name replaces the project's for that person's runs, which can break a project in a way only that person sees. The project page's list of inherited names is how that is found.
- A person removed from an organization keeps their personal rows there, unused, as they can no longer send a run; deleting the account or the organization deletes them.
