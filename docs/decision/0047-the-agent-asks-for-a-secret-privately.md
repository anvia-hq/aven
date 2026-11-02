# The agent asks for a secret privately

Status: accepted. Builds on 0020 (the agent can ask a question), 0045 and 0046 (variables and their scopes). Follows Amp, where an agent that needs a key "asks you to enter it in a private dialog, so the value does not appear in the thread".

## Context

An agent that needs an API key it does not have can only ask for it with `ask_user`, and the answer is the tool's output: it goes into the model's history, the run's journal and the transcript, where everything that reads the thread can see it. Asking in a message is the same.

## Decision

- **`request_secret` is a second question tool** (`createQuestionTool` with its own name and description), so it suspends the run and resumes it exactly as `ask_user` does (0020). Each question's `id` is the name of the environment variable to set (`STRIPE_API_KEY`); its `text` says what the value is for and where to find it.
- **The answer never reaches the agent.** When the control plane takes the answer to a pending `request_secret`, it first checks the answers are the questions' own, then stores each value as a **secret variable** in the scope the person chose, the project's (the default) or their own, and gives the run a placeholder in its place: `stored as NAME`. The model, the journal, the runner and the transcript hold only that. A person who would rather not give it says so (`skipSecrets` on the answer), nothing is stored, and the agent is told `not provided`; without that a waiting question would be a trap, since a message is refused while it waits (0020).
- **It is then an ordinary secret**: encrypted, write-only, redacted from tool results (0045), and merged into the run that resumes, since the variables are read after the answer is stored.
- **The control plane does not trust the runner's question**: each question id must be a valid, non-reserved variable name (the rules of 0045), or the answer is refused; declining is never refused, whatever the names, since nothing is stored and the person would otherwise have no way out of the question. The person's choice of scope is theirs; the agent does not pick it, so it cannot ask for a value to be shared with the workspace.
- **The thread shows a masked form** in place of the composer, a password field for each question and a choice of "This project" or "Only me" (`secretScope` on the answer), a way to decline, and afterwards the question with `stored as NAME` as its answer.
- **The agent's instructions** say to use it for any key, token or password it needs, never `ask_user` or a message, and to use the variable by name afterwards.

## Consequences

- The value is in the answer request on its way to the control plane, as a password is in a login: over the session's connection, in no log. It is in no event, message or journal.
- An agent that generates a value itself (a random password) has it in its own context; this does not store it for the user. That is not covered here.
- Only a person can answer, so an unattended session (a goal) has no `request_secret`, as it has no `ask_user` (0022).
- The control plane writes variables on a thread's answer, which makes the answer more than a message: a failed store (the 100-variable limit) refuses the answer, and the question stays waiting.
