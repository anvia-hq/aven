# A message sent while the agent works steers it

Status: accepted. Supersedes the "nothing is steered into a run" part of 0012, which dropped `run.steer` from the wire (version 3) along with the job notices that needed it. Builds on 0021 (runs through `@anvia/durable`), 0036 (mentions), 0096 (the live view) and 0097 (compaction, a run that takes no message).

## Context

While the agent worked, the composer had Stop and no Send, and the API refused a message with a 409. To correct the agent, a person had to stop it and start again, losing the step in progress. `@anvia/durable` now has steering: a message handed to a run is applied in the order it was accepted at the next safe boundary (before the first model call, after a tool batch, or after a model answer before the run is final), never in the middle of a call, and it stays in the conversation and the session's later history. It is refused once the run is finishing.

## Decision

- **A message sent to a thread whose agent is working goes to the agent** (`POST /threads/:id/messages` → `RunManager.steer`; the response says `steered`). Without a run, it starts one, as before. A message is `queued` once the runner has it and `steer` once the agent has taken it. Files do not go: they are copied into the sandbox as a run starts, so the composer's attach button is off while the agent works, and a request with files is a 409.
- **The runner hands it to the run's journal** (`run.steer`, a call with `{ runId, steerId, prompt, mentions? }` answering `queued`, `closed` or `refused`; wire version 39). The journal's `steering_applied` becomes the event `steer_applied { id }`, the only steering event a runner may send. A message that arrives while the sandbox is still starting waits in the run and is handed over once it is in the journal. It is built like a run's prompt (`sentPrompt`, with its mentions), so the transcript keeps it as the person wrote it and a reload shows it.
- **The control plane owns the words and tells every client the same thing**: `steer_queued { id, prompt, mentions }` when it accepts a message (before the runner is asked, so the runner's word that the agent took it, which can come before its answer, finds it), `steer` when the agent takes it (the control plane turns the runner's `steer_applied { id }` into it), and `steer_rejected { id, reason? }` when it will not be taken. The reducer applies `steer` as the person's next message followed by a reply of its own, which is how stored messages are projected, so the live transcript and a reload agree (tested). A client that attaches meanwhile gets what is waiting as `steers` in its snapshot.
- **Optimistic**: the web app shows the message at once as queued (dimmed, "Queued: the agent reads it at its next step", under the conversation), before the server has answered, and the composer is cleared at once, ready for the next message. It becomes the person's message on `steer`, and goes away on `steer_rejected` or when the request fails, when the text goes back in the composer (or, if the person has begun another message, is shown in the notice instead of replacing it). The composer keeps Stop and shows Send beside it once there is something to send; Enter sends.
- **Nothing is lost.** An agent that is finishing takes no more (`closed`): the message waits for the run to end and is sent as a message of its own, so the person sees it go from queued to sent. A runner that refuses it (a compaction, a goal working in the background) or cannot be reached gives the message back with the reason as the request's error. What the agent never took when a run is stopped or fails is said not to be delivered, with the words, so it can be sent again (`steer_rejected` with a reason).
- **Only a person's message steers.** Shipping and bots keep their refusal while the agent works (`threadMessages.start`, which never steers), since a ship prompt or a bot's note taken in the middle of work is not what either means.

## Consequences

- A runner that has not updated is refused until `aven update` (wire version 39).
- The native macOS client's reducer does not know the steering events and ignores them, as it ignores `usage` and `subagent`; a thread steered while it is open there shows the message after a reload (the macOS app is deferred).
- Steering consumes the run's turn limit (200) and does not extend it.
- The composer's placeholder stays the same while the agent works: Anvia's tiptap editor is made again when its placeholder changes, which broke a message sent just as a run began (found by this work's e2e run). `/` now waits (up to 3 seconds) for the skills to load instead of offering none.
- Tested in `durable-runs.test.ts` (the model's next request has the message after the tool's result; a finished run takes none), `runner.test.ts` (through the wire, while the sandbox starts, refused for a compaction), `runs/service.test.ts` (against a real runner and Postgres, live transcript equal to the reloaded one, a refusal, a stop), `runs/start.test.ts` (a finishing agent, an unreachable runner) and `e2e/steer.spec.ts` (queued at once, becoming the message, refused, reload).

## Note: a file in the draft does not stop the words

A file attached before the run started used to make Enter do nothing while the agent worked, with no sign why (Send is not shown then). Enter now sends the words alone as a steer and leaves the file in the draft for the next message.
