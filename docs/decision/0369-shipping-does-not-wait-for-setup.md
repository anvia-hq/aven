# Shipping does not wait for setup

Status: accepted. Supersedes the `Set up shipping` button of 0184, which replaced the ship action while `.aven/ship.md` was missing (0083, 0129).

## Context

The ship bar offered only `Set up shipping` until the repository had `.aven/ship.md`, although Aven's default ship prompt (commit, rebase, run the checks, push, open a draft pull request) works without one and the skill itself said so. A thread with changes to ship had no Ship button. The setup was also a long interview: the skill asked about a dozen questions in one message before writing anything, many of them answerable from the repository.

## Decision

- **Ship is offered whether or not the file exists.** The readiness answer's `ship` says whether it does (`ShipGate` is `ready` with `custom`), and the ship action, `Open a PR` and the pull request states work as before. Without the file the agent gets the default prompt.
- **Setup is a menu item, not a gate.** The arrow beside the ship action always holds it: `Set up shipping`, or `Change how Ship works` once the file exists. It sends `/setup-ship` as the person's message, as the button did. Nothing is offered when there is nothing to ship; the skill can still be typed.
- **The button says what it will do.** Its tooltip says it ships with Aven's default and where to change that, or that it follows `.aven/ship.md`.
- **The skill infers first.** It reads the contribution docs, the pull request template, the workflows, the recent merged pull requests and the scripts, writes a draft from them, shows it with the evidence for each choice, and asks at most three questions (proof, what must not happen, a contradiction). A repository that answers everything gets no questions.

## Consequences

- Ship works on any repository the moment GitHub is connected; customising it is optional and one click away.
- `GET /threads/:id/ship` keeps its `ready` field, which now equals `ship`; the platform ignores it.
- A person who relied on the button appearing to learn that shipping can be set up now finds it in the arrow menu.
