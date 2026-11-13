# An agent's cockpit work is announced as it happens

Status: accepted

## Context

The cockpit is the person's own (decision 0104) and an agent works it (decision 0109): a bot adds a task, changes a note, or reads the inbox to answer a question, and a thread's agent reads it. The person sees the result only if the cockpit page is open, and though `useBotChanges` reloads it while bots work, nothing says what changed or who did it.

## Decision

- **The control plane says what an agent did.** After `runCockpitCommand` answers, it publishes one activity for the person: the actor (a `bot` with its name, or a `thread` with its title), a sentence ("looked at your tasks", `added a task "Ship the release"`, "turned an inbox item into a task") and whether it changed anything. The caller already knows the actor, so no agent's command changes and nothing goes over the runtime wire.
- **It reaches an open tab on its own.** `cockpit/pulses.ts` keeps each person's watchers in memory, as the bots' working stream does, and `GET /cockpit/activity` streams them to that person over SSE; the platform opens it once per tab from `useCockpitActivity`, mounted by `CockpitActivityNotifier` in `AppShell`.
- **A toast for each activity, and a reload when something changed.** A change is a success toast (`Aven added a task "Ship the release"`) and reloads the cockpit's lists; a read is a plain toast (`Fix the release looked at your inbox`) with nothing to reload. There is no sound, and the activity is not kept: the cockpit itself holds the change.

## Consequences

- A person away from the app misses the toast; the change waits in the cockpit, unannounced.
- Every signed-in tab holds one more event stream, as it holds the bots' working one; a control plane with more than one replica reaches only the tabs connected to the replica that answered (decision 0236).
