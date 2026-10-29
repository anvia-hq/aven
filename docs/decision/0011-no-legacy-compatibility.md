# No compatibility with data from before sandboxes

Status: accepted. Supersedes the part of 0010 that kept projects without a runner.

## Context

0010 kept projects from before sandboxes as rows with no runner (`runtime_id` null) that showed "No runner" and refused to start threads. Aven is a new app with no data worth keeping, and every layer carried a branch, an error class and a badge for that one case.

## Decision

A project and a thread always have a runner: `projects.runtime_id` and `threads.runtime_id` are `NOT NULL`. The "no runner" paths are gone from the control plane, the platform and the native client. Migration 0012 adds the constraint; rows without a runner must be removed before it is applied.

## Consequences

- One less state to handle everywhere: a thread's `runtimeId` is always a string.
- A database that still has runner-less rows fails the migration until they are deleted.
- Future format changes are made in place, with a migration; we do not carry old shapes.
