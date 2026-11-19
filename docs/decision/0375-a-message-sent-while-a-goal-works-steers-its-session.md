# A message sent while a goal works steers its session

Status: accepted. Supersedes the "a goal working in the background refuses it" part of 0098. Builds on 0022 (goals) and 0134 (a goal session works in tool calls).

## Context

0098 lets a person correct an agent that is working by sending a message, which the run takes at its next step. A goal is worked in the background, and the runner refused every message sent to it: "stop it to talk to the agent". To redirect a goal a person had to stop it and start over, losing the session in progress.

`@anvia/durable` has no steering call for a goal, but each session of a goal is an ordinary durable agent run, and a run takes steering at its next safe boundary.

## Decision

- **A message sent while a goal works is steered into the session that is going.** The runner's `run.steer` keeps the phases it had: a chat run is steered as in 0098, a goal's closing report is still refused ("wait for it to finish"), and a goal's working phase hands the message to the session's run (`FollowedGoal.steer` in `durable-goals.ts`, which names the session from the goal's events, or from the journal's running run for the goal's agent when the event has not arrived yet).
- **No session going means `closed`.** Between sessions, while the goal is assessed, there is no run to take the message. The runner answers `closed`, and 0098's rule applies: the message waits for the run to end and is sent as a message of its own. Nothing is lost, but it is not read until the goal has ended.
- **The wire is unchanged.** `run.steer` already answers `queued`, `closed` or `refused`, so older control planes and runners work as they did, and the web app shows the message queued and then applied, as in a chat.

## Consequences

- A steer corrects the session it reaches. The next session starts from the saved handoff, not from the message, so the instruction lasts only if the agent writes it into its handoff.
- A steered message uses the session's turn budget, as in 0098.
- Tested in `durable-runs.test.ts` (a session takes the message at its next step and reports it; a finished goal takes none) and `runner.test.ts` (through the wire, while the goal's tool runs).
- Not tried against a real model: whether the agent acts on a steer in the middle of a long goal session.
