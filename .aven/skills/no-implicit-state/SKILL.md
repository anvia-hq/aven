---
name: no-implicit-state
description: Review a change for implicit state, meaning state that is hidden, inferred, shared or lost without the code saying so. Use after writing code that holds a value over time (a cache, a map, a flag, a timer, a ref, a connection, a global), when reviewing a diff, and when a bug depends on order, timing or a restart.
---

# No implicit state

State is a value that outlives one call. It is **implicit** when a reader cannot see who owns it, what values it can have, when it changes, or what happens to it on a restart. Bugs that "work on my machine", appear only after a restart or only when two things happen at once, come from it. This review makes each piece of state explicit or removes it.

## 1. Find the state

Look through the diff for each of these and write the list:

- a `let`, a `Map`, `Set`, array or object at module level, in a class field, or in a closure that outlives the call (`#cache`, `#running`, `const live = new Map()`);
- a singleton or an instance made on import (`export const service = ...`);
- a React `useRef`, `useState` or atom that mirrors something kept elsewhere (the server, the URL, `localStorage`, another atom);
- reads of the clock or the environment inside a function (`Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()`, `process.env.X`, `navigator`);
- a timer, interval, listener, subscription, socket or process that is started and must be stopped;
- a column, field or string whose meaning depends on another (`null` means "not yet", an empty string means "none", two booleans that must not both be true);
- an argument the function changes, or a result that is shared and later mutated.

## 2. Ask of each one

1. **Who owns it?** One place creates, changes and clears it. If two places write it, one of them is wrong.
2. **What values can it have?** Name them. Two booleans are four states; use one union (`"asleep" | "waking" | "awake"`) so an impossible state cannot be written.
3. **Is it derived?** If it can be computed from other state, compute it. A stored copy goes stale. (`isDriving(drivingUntil, now)` is computed from the time and one column; there is no `driving` flag to forget to clear.)
4. **When does it change and end?** Every start has its matching stop (`finally`, a cleanup, an `AbortSignal`). A map that only grows is a leak.
5. **What happens on a restart or a second process?** In-memory state is gone after a runner or server restarts and is not shared by a second instance. If the behavior must survive, keep it in the database or the runner's `runs.db.state`. If it must **not** be kept (a token, a variable value), say so: keep it in memory on purpose, and record that in a decision record.
6. **What happens when two things use it at once?** Check-then-act on state needs one atomic step, a lock or a unique constraint. Two runs, two tabs or two requests will arrive together.
7. **Does the order matter?** If a function only works after another was called, make that a parameter or a single function, not a convention.
8. **Can a test set it?** Pass the clock, the id source or the environment in, instead of reading it inside.

## 3. Fix it

Prefer, in order: remove it; derive it; pass it in as a parameter; give it one owner with a small typed interface; persist it where it must survive. Name the state after what it means. Do not add a comment to explain it (`comments-audit`): if it needs one, the design is not clear yet.

## 4. Report

List each piece of state you found, who owns it, and what you did, in a short table. Say which ones you left and the reason (a cache that is cheap to rebuild, a secret kept in memory on purpose). A piece of state you could not account for is a finding, not something to skip.
