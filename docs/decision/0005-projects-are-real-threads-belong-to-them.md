# Projects are real; threads always belong to one

Status: accepted

## Context

`projects` was a pure mock UI: a jotai atom seeded with fake repos, commits, files and CI status (`docs/products/0002-workspace-mock-ui.md`). Threads, meanwhile, were already real and backed by Postgres, but each thread carried a raw, free-typed `project_path` directly (`threads.project_path`) — there was no `projects` table at all. Starting a session meant retyping or picking from a flat list of recently-used filesystem paths, with no durable, named entity grouping them.

## Decision

- **Projects are a first-class, persisted entity**, scoped to an organization: `{ id, name, projectPath, createdAt, updatedAt }`. The model is kept minimal on purpose — no repo URL, description, language or default branch — since none of that is backed by a real git integration yet.
- **A thread always belongs to a project.** `threads.project_id` is a required foreign key. `threads.project_path` is kept as an immutable snapshot of the project's path taken at creation time (not a live join), so the agent's working root and a thread's displayed path never change even if the project changes later, and no join was needed to keep the existing `Thread` wire shape.
- **No free-text path entry for threads anymore.** The global "New thread" flow and a project's own page both require picking (or first creating) a project; `POST /threads` takes `projectId`, not `projectPath`.
- **Mock git data (commits, files, CI status) was removed** from the project page rather than kept around disconnected from reality. It returns once there is a real git integration to back it.

## Consequences

- `GET /threads/paths` and the "recent project paths" UI are gone, superseded by listing projects.
- The e2e suite's project-related flows (`workspace.spec.ts`, `threads.spec.ts`) were rewritten to create a real project through the UI instead of relying on seeded mock data; the All/Active/Archived tabs and Archive/Restore flow were dropped since there is no archive concept for projects yet.
- A duplicate `(organization_id, project_path)` is rejected (409) rather than silently creating a second project pointed at the same directory.
