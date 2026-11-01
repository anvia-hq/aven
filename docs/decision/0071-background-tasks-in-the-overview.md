# Background tasks: seen and stopped from the overview, and started with a flag

Status: accepted. Builds on 0012 (the agent's tools are the sandbox's, nothing reports a process that ends), which stands. Follows the Anvia harness, whose session panel has a Background tasks section with a Stop button.

## Context

The agent could already start processes in the sandbox (`start_process`, `list_processes`, `read_process_logs`, `stop_process`), but a person could not see them. A dev server the agent left running, or one that died, was visible only in the conversation, and stopping one took a message to the agent. A command the agent wanted to leave running had to be started with a different tool than the one it runs commands with.

## Decision

- **A runner answers three calls about a thread's processes** (wire 33): `processes.list`, `processes.stop` and `processes.logs`, from the sandbox's own `listProcesses`, `stopProcess` and `readProcessLogs`. They never start a sandbox: one that is not up has no processes, and a stop or a read of the logs of one that is not there is an error. Logs are the end of each stream (16 KiB).
- **What a person is shown hides the run's secrets**, as the agent's tool results do (0045): the command and the output go through the same redactor, kept per thread beside the project's variables and gone with the container. The panel must not show more than the conversation does.
- **The control plane serves them** at `GET /threads/:id/processes`, `POST /threads/:id/processes/:processId/stop` and `GET /threads/:id/processes/:processId/logs`, scoped to the caller's organization like the thread's diff and files. Any member of the organization may stop a process, as any may cancel a run. What a runner answers is checked before it is used.
- **The overview has a Background tasks card** between Environment and Context: running processes first, then the five most recent that ended, each with how it is doing (running for how long, exited with its code, stopped), its output on demand and, while it runs, a Stop button. It looks every five seconds and again when a run starts or ends; an output that is open and still running is read every three.
- **`exec_command` takes `background: true`.** It is the sandbox's own tool with one more option, and a command run with it is started by the sandbox's own `start_process`, so it is the same managed process the card lists. `timeoutMs` and `input` are refused with it. The agent's instructions name both ways. Built on the two tools, not on the runtime, so the sandbox's handling of a command line is not done twice.

## Consequences

- Nothing tells the agent that a process ended (0012 stands): the card is for the person, and the agent still looks with `read_process_logs` and `list_processes`. Waking the agent when a process ends or prints something would be a decision of its own: it needs a run without a person to start it.
- The list is what the sandbox remembers; a container that was freed has none, and one process list is kept per container's life. A runner older than wire 33 is refused at connection, so the card never talks to one.
- Bots get the `background` option too, since their computers use the same tools, and have no card.
