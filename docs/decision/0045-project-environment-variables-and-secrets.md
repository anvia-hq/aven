# A project has environment variables and secrets, set in the app

Status: accepted. Builds on 0043 (environments: setup script and snapshots). Follows Amp, whose projects have "Secrets & Env Vars" in their settings, applied to a thread's environment and not written to a file.

## Context

0043 lets a repository set its environment up with `.aven/setup`, which is committed, so it can hold no secret and no value that differs between people. A project that needs `DATABASE_URL`, an API key or a feature flag to run has nowhere to put it: the agent either asks every time or writes a `.env` that nobody reviewed. A shared snapshot must also never hold a person's credential.

## Decision

- **A project owns a set of variables**, each a name, a value and a `secret` flag. They belong to the project (so to its organization), not to a user, and any member of the organization can change them, as they can a project.
- **A secret is write-only.** The API never returns its value, only that it is set and, for a value of at least 12 characters, its last four (`valueHint`), as provider keys do (0006); a shorter one would be shown whole. A plain variable is returned and editable. Values are stored encrypted with the same AES-256-GCM key as provider keys (`PROVIDER_ENCRYPTION_KEY`), secret or not.
- **Names** are `[A-Za-z_][A-Za-z0-9_]*`, at most 128 characters; a value is at most 8,192 characters; a project has at most 100. Names the runner or the sandbox rely on (`PATH`, `HOME`, `USER`, `SHELL`, `LD_*`, `AVEN_*`, `GH_*`, `GITHUB_*`, `GIT_*`) are refused, so a variable cannot change how the sandbox or its GitHub sign-in behaves.
- **A run carries them**: `env` on `run.start` and `run.resume` (a list of `{ name, value }`), read when the run starts, so a change applies from the next run. They are sent on the connection a runtime already holds, like `github` (0044).
- **The runner holds them in memory only** and applies them to the environment of every command the agent runs in the thread's container (`exec_command`, processes it starts), never to a file, a command line, the journal or a snapshot. A run taken up after a runner restart has none until the next message.
- **Not in setup.** A setup container (0043) and the snapshot get no project variables, so a snapshot is the same for everyone and holds no secret. A setup script that needs a value copies a template, `[ -f .env ] || cp .env.example .env`, which is for local, non-secret values; `/setup-env` says so.
- **The agent is told the names, not the values**: its instructions list the variable names set for the project, so it knows `DATABASE_URL` exists without seeing it.
- **A database is the repository's own business**, not a feature: `.aven/setup` installs the server and `.aven/resume`, which runs as `node` without `sudo` (thread containers have `no-new-privileges`), starts one in the home folder. It was run in the sandbox image to check it, and `/setup-env` carries the script. The data lives in the container, so a thread whose container was freed and comes back finds the snapshot's data, not its own.

## Consequences

- A command the agent runs can read and print any value, including a secret, and a prompt injected into what the agent reads could steer it to. The guard is the person watching the thread and what they choose to put in as a secret; a project should hold keys it is happy to give an agent, as with GitHub in 0044.
- **A secret is hidden from what the agent's tools give back**: the runner replaces every occurrence of a secret's value, in every string of a tool result, with `[redacted]` before the result reaches the model, the journal or the control plane, goal checks included. A secret shorter than 8 characters is not hidden (it would be cut out of ordinary text, and is guessable), and the settings page says so. Only the value as it is: a command that prints it encoded (base64, URL-escaped) or in pieces is not caught, and an output that reaches the agent by another way than a tool (a file the agent writes and later reads) is read as it is. A secret needs a value; an empty one is only for a plain variable.
- Per-user secrets (a personal key) and organization-wide variables are not here; Amp has both, and either can come later.
- Wire version goes to 19. The control plane stores values; the runner never persists them.
