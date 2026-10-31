# A project has environment variables and secrets, set in the app

Status: accepted. Builds on 0043 (environments: setup script and snapshots). Follows Amp, whose projects have "Secrets & Env Vars" in their settings, applied to a thread's environment and not written to a file.

## Context

0043 lets a repository set its environment up with `.aven/setup`, which is committed, so it can hold no secret and no value that differs between people. A project that needs `DATABASE_URL`, an API key or a feature flag to run has nowhere to put it: the agent either asks every time or writes a `.env` that nobody reviewed. A shared snapshot must also never hold a person's credential.

## Decision

- **A project owns a set of variables**, each a name, a value and a `secret` flag. They belong to the project (so to its organization), not to a user, and any member of the organization can change them, as they can a project.
- **A secret is write-only.** The API never returns its value, only that it is set and its last characters (`valueHint`), as provider keys do (0006). A plain variable is returned and editable. Values are stored encrypted with the same AES-256-GCM key as provider keys (`PROVIDER_ENCRYPTION_KEY`), secret or not.
- **Names** are `[A-Za-z_][A-Za-z0-9_]*`, at most 128 characters; a value is at most 8,192 characters; a project has at most 100. Names the runner or the sandbox rely on (`PATH`, `HOME`, `USER`, `SHELL`, `LD_*`, `AVEN_*`, `GH_*`, `GITHUB_*`, `GIT_*`) are refused, so a variable cannot change how the sandbox or its GitHub sign-in behaves.
- **A run carries them**: `env` on `run.start` and `run.resume` (a list of `{ name, value }`), read when the run starts, so a change applies from the next run. They are sent on the connection a runtime already holds, like `github` (0044).
- **The runner holds them in memory only** and applies them to the environment of every command the agent runs in the thread's container (`exec_command`, processes it starts), never to a file, a command line, the journal or a snapshot. A run taken up after a runner restart has none until the next message.
- **Not in setup.** A setup container (0043) and the snapshot get no project variables, so a snapshot is the same for everyone and holds no secret. A setup script that needs a value copies a template, `[ -f .env ] || cp .env.example .env`, which is for local, non-secret values; `/setup-env` says so.
- **The agent is told the names, not the values**: its instructions list the variable names set for the project, so it knows `DATABASE_URL` exists without seeing it.

## Consequences

- A command the agent runs can read and print any value, including a secret, and a prompt injected into what the agent reads could steer it to. The guard is the person watching the thread and what they choose to put in as a secret; a project should hold keys it is happy to give an agent, as with GitHub in 0044.
- A transcript may show a secret if a command prints it. The runner does not redact.
- Per-user secrets (a personal key) and organization-wide variables are not here; Amp has both, and either can come later.
- Wire version goes to 19. The control plane stores values; the runner never persists them.
