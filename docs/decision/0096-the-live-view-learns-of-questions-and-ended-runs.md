# The live view learns of questions and of runs that ended

Status: accepted. Builds on 0020 (the agent's question and the answer form), 0021 (runs through `@anvia/durable`) and 0084 (the thread list).

## Context

Two things sometimes stayed wrong on screen until the page was reloaded.

1. **The question form did not appear.** A run that asks with `ask_user` ends as an `interaction`; the form shows when the live transcript ends in that tool call. The runner turns durable's journal into the events a client sees, and announced a tool call from a finished `tool_call` stream event or from `tool_started`. A model whose provider streams a call only in pieces (`tool_call_delta`, as `muse-spark-1.3-contributor` does through an OpenAI-compatible gateway) sends no finished call, and a question never starts, since it parks the run before the tool runs. So no event ever carried the question; a reload rebuilt the transcript from the stored messages, which had it. Replaying the real journal of past runs through the mapper and the reducer showed it: five of six question runs (a model that streams the finished call) ended with the question pending, the one with this model did not.
2. **A project's tile kept pulsing after its thread finished.** The tile pulses while the thread's `running` flag in the sidebar's list is true. Only the open thread's stream moved that flag (on `run_start`, `done` and `error`), so a run that ended while another page was open, or between a stream's loss and its return, left the flag true until the list was fetched again, which happened only on a reload.

## Decision

- **A tool call is announced when its model turn finishes, if nothing announced it yet** (`createDurableEventMapper`, on `model_completed`: the turn's `tool-call` parts, in the order the model made them, before the turn's usage). A call is still announced once, by whichever comes first: the stream's finished call, the finished turn, or the tool's start. A question is therefore live for every provider.
- **The thread's stream sets the sidebar's flag from every snapshot**, not only from the events after it, so opening a thread, or the stream coming back, brings the sidebar to what the server says; and a stream that is lost for good asks for the list.
- **The sidebar asks for the list every five seconds while any thread in it is shown as running** (`SidebarThreads`, which the shell mounts once), so another thread's tile stops pulsing when its run ends. Nothing is asked while nothing runs.

## Consequences

- For a model that does not stream finished calls, tools now show when the turn ends rather than when each one starts: a moment earlier, never later.
- The question fix is in the runner, so it takes effect on a runner after `aven update`; the sidebar fix is in the web app.
- The list is read at most every five seconds from a browser that has a running thread. It is one request for the person's own threads.
