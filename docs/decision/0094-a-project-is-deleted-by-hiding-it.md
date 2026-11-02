# A project is deleted by hiding it

Status: accepted. Builds on 0011 (a thread always belongs to a project) and 0093 (who may change a project). Replaces nothing: before this, a project could not be deleted.

## Context

A project could not be removed. Deleting its row would have been easy, since a project's threads, their pull request links, its variables and their history all go with it (`ON DELETE CASCADE`), but that also erases every thread the project ever had, archived ones included, and a profile page that shows what a person has done with Aven needs those threads to stay.

## Decision

- **`DELETE /projects/:id` hides the project; it does not remove the row.** `projects.deleted_at` is set. Every lookup of a project (`list`, `get`, a person's projects for a bot) skips a deleted one, so it is gone from the list, the picker, the new-thread page, its own page (404), the commits, files and pull requests of its repository, and its variables.
- **Its threads are archived, in the same transaction, and kept.** They leave the sidebar and the lists, as an archived thread does, and stay in the database with their usage and history for whatever counts them. A thread of a deleted project can still be opened by its link, read-only in effect: sending it a message or answering its question is a 409 (`This thread's project was deleted`), and the runner is no longer given a clone token for it (`repoAccess`).
- **Runs stop.** Once the transaction has committed, the run manager cancels any run in the project's threads. What the agent started in a sandbox is left as cancelling a thread leaves it (0012).
- **Its variables are erased**, since a project's variables may be secrets and nothing can use them any more. The history of who changed them stays (it never held a value).
- **The repository can be imported again.** The unique index on a workspace's repository now covers live projects only (`WHERE deleted_at IS NULL`), so the new import is a project of its own with none of the old one's threads or variables.
- **Who may delete is who may move it (0093)**: whoever imported the project, an owner or an admin. Others get a 403. The project page's About card has a Delete project button for them, behind a confirmation that says what goes (the project, its variables, running work) and what stays (the repository, the threads, archived).
- **Nothing on the runner is cleaned.** Workspaces, containers, journals and uploads of the project's threads stay as they are for an archived thread. Telling the runner to remove them is a later change (it needs a runner message of its own).

## Consequences

- Migration `0038`: a nullable column, and the unique index dropped and recreated as a partial one. Code of the previous release running on the new schema still works, but lists deleted projects as live, so pinning it again shows them. There is no downgrade of the database.
- A deleted project cannot be restored from the app; clearing `deleted_at` in the database would bring it back, without its variables.
- A thread of a deleted project counts in anything that counts threads, by design.
