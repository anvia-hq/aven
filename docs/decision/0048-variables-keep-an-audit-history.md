# Variables keep an audit history, without values

Status: accepted. Extends 0045 to 0047. Follows Amp, where a person can see who created or changed each secret and variable, without the values (`amp secrets history`, and the settings pages).

## Context

A variable reaches every run of the threads it applies to, and a workspace one reaches every member's. When a run breaks or a secret is suspect, the question is who changed what, and when. Nothing recorded it.

## Decision

- **Every change is an event**: a variable was created, updated or removed, with its name, whether it is a secret, who did it, how (the settings or the agent's request for a secret, 0047) and when. **No value is ever recorded**, not a secret's, not a plain one's, not a hint of one.
- **One table, `variable_events`**, with the same scope columns as the variables (`project_id`, `user_id`, neither for the workspace) and `organization_id`. It is written in the same transaction as the change, so a change cannot be made without its event, and an event cannot describe one that was not made.
- **Who may read it is who may read the list**: a workspace's and a project's, any member of the organization; a person's own, that person alone, and no one else, as with the variables themselves.
- **Events outlive the variable and the person**: removing a variable keeps its history, and deleting the account that did it leaves the event with no name. Deleting the project, the organization, or (for a person's own) the account deletes them.
- **API**: `GET .../history` on each scope (`/projects/:id/variables/history`, `/variables/workspace/history`, `/variables/personal/history`): the latest 100, newest first, each with the actor's name.
- **Settings**: each list has a History button that opens the events.

## Consequences

- A person's own history is deleted with their account, since it is theirs; a workspace or project event keeps the actor's id only until their account goes.
- History is not undo: with no value kept, it cannot restore one.
- It is not tamper-proof against someone with database access; it is a trail for people, not an audit log for compliance.
- The table only grows. At the size of a team's variables (100 per scope) that is small; a retention rule can come if it matters.
