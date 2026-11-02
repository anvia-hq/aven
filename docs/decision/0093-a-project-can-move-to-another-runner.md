# A project can move to another runner

Status: accepted. Builds on 0010 (a project's sandboxes run on its runner) and 0011 (a thread copies its runner from the project when it is made).

## Context

A project is imported with a runner (0013) and had no way to change it: moving to a bigger machine, or from a laptop to the control plane's own runner, meant importing the repository again, which loses the project's variables and its page.

## Decision

- **`PATCH /projects/:id` with `{ runtimeId }` changes the runner.** The runner must be one of the workspace's, or the built-in one, and not revoked (the check import makes); it need not be online. The same runner is a no-op.
- **Only threads started afterwards use it.** A thread copies the project's runner when it is made (0011), and its workspace, container, journal and uploads are on that runner, so a thread already started stays on the one it began on and is read through it as before. Nothing is copied between machines. To carry work over, push the thread's branch and start a thread on the new runner.
- **Whoever imported the project, or an owner or an admin of the workspace, may do it**; any other member gets a 403. Runners are shared with the whole workspace, but a project's runner decides where everyone's new threads in it run, so it is not every member's to change. (`projectsService.requireManager`, shared with deleting a project, decision 0094.)
- **The About card's Runner row is a menu for those who may change it**, with a line saying that started threads stay where they are, and the badge it was for everyone else. A member who may not change it sees no menu, as for workspace variables (0046), though the control plane is what refuses.

## Consequences

- Revoking the old runner is not prevented by its threads (a revoked runner is only marked, not deleted): those threads cannot be reached until it is back, as before this change.
- The setup snapshot of 0043 is per runner, so the first thread on the new runner runs `.aven/setup` again.
- Project variables stay with the project and follow it.
