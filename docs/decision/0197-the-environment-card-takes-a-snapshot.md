# The Environment card takes a snapshot

Status: accepted. Builds on 0043 (a repository sets up its environment once, and threads start from a snapshot).

## Context

0043 makes a snapshot the result of running the repository's `.aven/setup` in a fresh setup container, and only an agent run could ask for one: the agent's `save_environment` tool, which the `/setup-env` skill ends with. A person who has written or changed `.aven/setup` themselves had to start a run to have it saved.

## Decision

- A thread's Environment card has a Take snapshot row for the thread's owner: it says when the last snapshot was saved in this server's memory ("No snapshot yet" when there is none), and its button asks for a new one. It is disabled while one is being taken and while the runner is offline.
- It does what `save_environment` does, with no model run: the control plane has the runner run `.aven/setup` in a fresh setup container and keep the result for new threads of the repository (`environment.save`, wire version 54). The control plane sends the repository's clone URL and a read-only token with the call, as it does for a run (`repo.access`).
- The call can last many minutes, so `POST /threads/:id/environment/snapshot` answers 202 at once and the control plane waits for the runner, up to 30 minutes. `GET /threads/:id/environment` says `idle` or `running`, when the last snapshot was saved and the reason the last one failed; the card polls it every three seconds while one runs and says the result in a toast. A second request while one runs is refused.
- The snapshot is still what the script makes, never what the thread's own container accumulated (0043). A repository without an executable `.aven/setup` fails with the runner's own message, which the toast shows.

## Consequences

- The state is kept in the control plane's memory, per thread: a restart forgets when the last snapshot was saved, and a snapshot running during one is lost to the card, though the runner finishes it. The runner's snapshot is the authority; the card only reports.
- A runner has to be updated to take one (`aven update`): an older runner is refused by the wire version.
- Capturing a thread's own state, as it is now, is not done; it would break the rule above.
