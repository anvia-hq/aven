# 0201: The Environment card asks the runner for the snapshot

Status: accepted. Refines 0197 (the Environment card takes a snapshot).

## Context

0197 had the card say when the last snapshot was saved from the control plane's memory, and only a snapshot taken through the card's own button was written there. A snapshot the agent saved with `save_environment` (the end of `/setup-env`) was never recorded, so the card said "No snapshot yet" next to a snapshot new threads were already using; and a restart of the server forgot the card's own too. 0197 named this as a consequence ("the runner's snapshot is the authority; the card only reports"), but a person reasonably took the card to show the snapshot, not the card's own history.

## Decision

- **The runner says when the snapshot of a thread's repository was saved.** A new call, `environment.read` (the same parameters as `environment.save`), answers `{ savedAt }`: the time in the snapshot's own record on the runner's disk, or `null` when there is none, or when it is older than the 72 hours a snapshot is used for (0043), or was made from another sandbox image.
- **`GET /threads/:id/environment` asks it whenever no snapshot is being taken**, and answers with its time. A failure the card has seen stays until a newer snapshot has been saved. While one is being taken the control plane answers from its own state, without asking.
- **If the runner cannot answer** (it is offline, or an older one that does not know the call), the control plane falls back to what it remembers, as before.
- **This is not a change of `WIRE_VERSION`**: it is a call, an older runner refuses it with an error, and the control plane copes with that. An older runner shows the card's own snapshots only until `aven update`.

## Consequences

- The card shows the real snapshot after a restart of the server, and one the agent saved.
- The card's poll while a snapshot runs is unchanged (the control plane's state, every three seconds); the call is made when the card loads, and when it asks while idle.
- A snapshot older than 72 hours shows as none, which is what a new thread would find.
