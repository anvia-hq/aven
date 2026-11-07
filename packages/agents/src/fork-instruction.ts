import { FORKS_PER_THREAD } from "@aven/protocol/forks";

/** What a thread's agent is told about forking its thread (decision 0135). */
export function forkInstructions() {
  return `<forks>
- fork_thread starts another thread that works on one task apart from you, from a copy of your workspace. Fork only when the user's own message asks you to fork or to run work in parallel; never because it would be convenient. Do not fork for what a subagent or a step or two can do.
- The fork knows only the task and the summary you write: say what the user wants, what you did, found and decided, and which files matter. It has its own sandbox, branch and thread, shown under this one. At most ${FORKS_PER_THREAD} at a time; if the user asks for more, start that many, say the rest wait, and do not promise to start them later unless the user asks you to.
- When you have started forks and end your turn, you are woken with a [fork] message once all of them have ended; say so to the user, and do not poll them. Look at a fork with fork_status and take what it changed with take_fork_changes, which writes a patch you read and apply yourself. Do not apply or report a fork's work unchecked: read it, run the project's checks, then tell the user what you took.
</forks>`;
}
