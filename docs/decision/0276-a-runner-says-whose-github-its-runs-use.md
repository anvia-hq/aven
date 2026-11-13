# 0276: A runner says whose GitHub its runs use

Status: proposed. Supersedes the identity parts of 0044 and 0229 once built; narrows 0192 to runners in person mode. Nothing here is built yet.

## Context

Which GitHub a run acts as is decided by something unrelated to identity, whether the project has a GitHub App installation, and the outcome is mostly implicit:

- A project with an installation: 0044 says the run acts as the person, with their own token, and 0192 says a teammate's run acts as the teammate. The control plane sends the token (`github` on `run.start`).
- A folder project (no installation) on a persistent runner: 0229 ships with whatever `gh` and git login the machine has. The ship bar counts GitHub as connected without checking that the machine is signed in, and a teammate ships as the machine's owner without being told.
- On a host runner nothing signs `gh` in with the person's token: `signInGithub` is declared on the sandbox interface (0044 wrote it for the container sandbox, retired by 0219) and `HostSandboxes` does not implement it. A project with an installation therefore sends a token that is not used, and the machine's login runs, while the decision, the ship bar and the agent's instructions say "the person".
- Nothing tells the person, before they ship, which of these applies.

## Decision

- **GitHub identity is a property of the runner, not of the project.** A runner has a setting, `githubMode`, with two values, set by the runner's owner (`runtimes.owner_id`) in Settings > Runtimes:
  - **`machine`**: every run on this runner uses the machine's own `gh` and git login. Aven sends no GitHub token and says so.
  - **`person`**: every run uses the sender's connected GitHub account, given to the runner for that run only. A sender with no connection gets none, and never falls back to the creator's (0192) or to the machine's login.
- **No hybrid.** There is no "owner only" mode; a teammate who wants their own identity uses a runner in `person` mode.
- **A temporary runner is always `person`.** `ephemeral` runners (0229) cannot be set to `machine`, which replaces 0229's special case in the ship refusal.
- **The project's GitHub App stops deciding identity.** It is for importing repositories, cloning and reading pull request status. A person's connection is the user token already stored per person and app (`github_user_tokens`, `PLATFORM_APP` by default); whether a person can connect without a project installation, for a folder project, is checked in stage 3 before relying on it.
- **A person's token reaches a host runner through the run's environment**, not through the machine's global `gh` or git configuration: `GH_TOKEN` and git's `GIT_CONFIG_*` for the run's processes only, with the commit name and noreply email from `RunGithub`. It is held in memory, as in 0044, and is not written to the runner's disk or journal.
- **The runner reports its own login.** On connect it says, in an optional field of `hello` (as `hello.build` was, so the wire version stays), which login `gh` is signed in as on the machine, or that it is not signed in. Settings shows it, and warns when the mode is `machine` and nothing is signed in.
- **The identity is always shown before anything is pushed.** The ship bar and the thread's overview say one of: "Shipping as this machine's login (@login)", "Shipping as you (@login)", "No GitHub for this run: connect yours to push". A teammate on a `machine` runner is told they will ship as the machine's login before they send. The agent's instructions state the identity, so it does not infer it from `gh auth status`. The run's record keeps who sent it and which identity it used.

## Rollout

The change would alter behaviour, so it is staged to change nothing until an owner chooses.

1. **Information only.** The runner reports its login, and the bar, the overview and the agent say what happens today, including "machine's login" for folder projects and for projects with an installation on host runners.
2. **The setting.** `runtimes.github_mode` is added; every existing runner is migrated to `machine`, which is what they do today, so no run changes. Owners switch to `person` when they want to.
3. **Person mode on host runners.** The per-run environment sign-in above, and the check that a person can connect for a folder project.

## Consequences

- Whose GitHub a run uses is one explicit, visible setting on the runner that does the work, and the same on every project.
- On a `machine` runner a teammate ships as the machine's login: that is now the chosen, labelled behaviour of the runner, not an accident of the project type.
- `person` mode on a host runner needs the sign-in of stage 3 and a wire change that carries the mode and the runner's reported login (both optional fields); a runner from before keeps behaving as `machine`.
- `git_fetch` (0042) and the ephemeral ship refusal (0229) go away or shrink once stage 3 is built.

## Not decided

- Whether a runner's mode can be set per project or per organization as well; this proposes one place, the runner.
- Whether an organization admin, and not only the runner's owner, can change a runner's mode.
