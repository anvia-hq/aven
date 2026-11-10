# 0202: A run that answers a question keeps the token of the run that asked

Status: accepted. Refines the per-run gateway tokens of commit 4dcd51a8 (0.5.17) and builds on 0021 (runs go through anvia-durable).

## Context

Since 0.5.17 every run has a gateway token of its own, made from the thread and the run's id and taken away when the run ends. A run that asks a question ends with `interaction`, so its token is taken away; the answer starts a new run, with a token of its own.

But the runner keeps the asking run's agent registered while the question waits, since a durable run needs its agent to go on, and anvia-durable does not let a registered agent id be replaced or removed while its run waits (`Existing IDs cannot be replaced`, `Agent still has unfinished work`). So the run that answers continues with the agent that asked, which holds the first run's token. The control plane no longer knew that token, and the first model call after the answer was refused: `401 {"error":"Unauthorized"}`, five times, then the run failed with the question still shown. The runner's journal of such a run shows five `model_attempt_failed` at the first model call after the answer. A runner that has restarted since the question builds a fresh agent and is not affected, which is why this was not seen in tests, and not on every thread. Before 0.5.17 the token was made from the thread alone, so the answer worked.

## Decision

- **A run that answers a question is given the token of the run that asked.** The continuation the control plane keeps names the asking agent (`run-<runId>`, `agentId` of the continuation); the token is made again from that run's id and the thread, as it was the first time, so it is the same string. It is the run's own grant (its model and key are the answering run's), and it is taken away when the answering run ends, as any run's is.
- **A grant is taken away only by the run that holds it.** The run that answers holds the token of the run that asked after the latter's end, so a late revoke of the asking run cannot take it away from the answering one.
- **The token is made again, not stored**, so it holds after a restart of the control plane too. A continuation that does not name an agent in this form gets a token of its own, as before.
- **A run that goes on asking** keeps the same token, since its continuation still names the agent that was built first.

## Consequences

- Tokens are still per run and still taken away at the run's end: between the question and the answer nothing can use one.
- The agent that answers keeps the model it was built with. If the answer picks another model, the gateway forwards with the new run's provider and key but the old agent's requests; a different provider is refused as "Wrong provider for this run". Making the model of an answer take effect needs the runner to build the agent again, which anvia-durable does not allow today.
- `docs/bugs/` does not list this: the limit is anvia-durable's rule that a registered agent cannot be replaced while its run waits.
