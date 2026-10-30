# The agent can ask the user a question

Status: accepted.

## Context

The agent could only finish a run, never ask for input: when a request was ambiguous it had to guess or end its reply with a question that the user then answered as a new message. `@anvia/core` has a question tool (`createQuestionTool`, `ask_user`): the run suspends on it and ends with an `interaction` outcome carrying a `continuation`; resuming means starting a run from that continuation plus the answers (`AgentInput.continuation` and `response`).

## Decision

- **`ask_user` is one of the agent's tools** (`createCodingAgent`, `questions`, on by default). The agent asks one to four questions at a time, each with optional choices and `allowCustom`.
- **A question ends the run and the answer starts another**, rather than a run that waits. Nothing is held open on the runner while a person thinks, so the runner's idle release, a restart of the runner or of the control plane, and a long wait are all fine. It matches decision 0012: a run is a bounded piece of work.
- **The control plane keeps the continuation** in `threads.pending_continuation` (jsonb, migration 0014) from the moment the run ends as `interaction` until it is answered. It holds conversation state, so it never leaves the server: clients read `awaitingAnswer` instead. It is validated when it arrives (a runtime is not trusted) and when it is used.
- **The wire is version 8.** `run.resume { runId, thread, continuation, response, model? }` starts the resumed run (the model grant is issued again, since the first run's was revoked), and `run.end` carries `continuation` when the outcome is `interaction`. An older runner cannot resume, so it is refused at hello.
- **In the transcript the question is a tool part** (`ToolPart.questions`), so a reload shows it from the stored history with no extra state. A new event, `run_resume`, marks the continuation: unlike `run_start` it adds no messages, so the reply continues in the same assistant message. `pendingQuestion` and `questionAnswers` in `@aven/protocol/events` are how a client finds the question and reads the answers (the tool's output).
- **`POST /threads/:id/answer`** takes `{ answers, providerId?, modelId?, reasoningEffort? }`; the answers must be the questions' own (checked with Anvia's `assertAgentInteractionResponse`). Sending a message while a question waits is `409`: it would leave the question unanswered in the history, which providers reject.
- **The platform replaces the composer with the form** while a question waits; the conversation shows the question, then the answer.

## Consequences

- The continuation is consumed when the answer is accepted. If the resumed run then fails before it stores the answer, the history ends in an unanswered question and the thread cannot be continued with a message; this is rare and has no recovery yet.
- A question has no timeout: it waits until answered. Cancelling does nothing to a thread that is not running.
- The macOS client (deferred) ignores `run_resume` as an unknown event, as the contract says, but cannot answer yet.
