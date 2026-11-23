# Decisions

Why we chose X over Y: the context, the options, what we decided and what followed. One file per decision, with a number in its name (0387).

## Format

`xxxx-name.md`, where `xxxx` is the next number at the end of the folder and the name is the decision in kebab-case. The file starts with a `# Title` that carries no number — the file name does, and it is a short name for the decision rather than the whole title — then a `Status:` line that says `accepted.` and how the decision sits with the others: what it refines, what it supersedes, and what supersedes it. A date, where it matters, ends that line as `Decided 2026-11-15.` A superseded decision keeps its number and its `Status:` line, because it still records what was decided and why (0154).

A number is unique and permanent, and it is never reused. Two pull requests that take the same number end with the later one at the next number at the end, with every reference to it moved in the same change. That is how 0298 moved once, and how thirteen decisions came to sit at 0374 to 0386. The gaps at 0122, 0253 and 0303 stay empty for the same reason.

`tooling/docs/decision-folder.test.mjs` runs in `bun test`: it refuses a number used twice, a number in a title, a decision with no `Status:` line or two of them, a superseded decision this file does not name, a row that names a replacement its own `Status:` line does not, and a count that disagrees with the folder.

## What still holds

395 decisions: 302 are the answer, 39 are superseded and 54 are superseded in part. The two tables below name every decision whose own `Status:` line says a later one superseded it, whole or in part, and `docs/products/0007-system-reference.md` says how each part of Aven works today.

To find one, list the folder (it is in number order) or `grep -ril "<the words>" docs/decision`.

## Superseded (39)

These describe something that is gone. Read what replaced them.

| Decision | What it decided                                                                              | Superseded by                |
| -------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| 0009     | Sandboxed runtimes: Anvia sandbox with a desktop image                                       | 0219                         |
| 0010     | Projects run in per-thread sandboxes on a runner                                             | 0219                         |
| 0014     | The sandbox image is a KDE Plasma desktop with Chrome                                        | 0219                         |
| 0015     | The portal shows a thread's desktop and lets a person take it over                           | 0219                         |
| 0016     | The runtime containers run under is configurable, for gVisor                                 | 0219                         |
| 0037     | The sandbox ships the common toolchains and runs with 4 CPUs and 8 GB                        | 0219                         |
| 0038     | The sandbox desktop is Xfce                                                                  | 0219                         |
| 0039     | A person can wake a thread's sandbox from the Desktop panel                                  | 0219                         |
| 0043     | A repository sets up its environment once, and threads start from a snapshot                 | 0219                         |
| 0070     | Patch `@anvia/durable` so a thread's agent can run tool calls side by side                   | 0296                         |
| 0072     | A workspace restored from a snapshot starts with no untracked files                          | 0219                         |
| 0095     | The sandbox works for the host user's uid                                                    | 0219                         |
| 0113     | Sandbox and setup containers start with an init                                              | 0219                         |
| 0123     | A workspace may have its own GitHub App                                                      | 0323                         |
| 0127     | A snapshot is cloned in one call on macOS                                                    | 0219                         |
| 0128     | A run starts while its sandbox is got ready, and a spare workspace waits for the next thread | 0219                         |
| 0129     | Ship is not shown until the repository is set up                                             | 0184                         |
| 0131     | Center shows every project's pull requests and commits on one screen                         | 0291                         |
| 0132     | Center filters, opens, and lists branches and history                                        | 0291                         |
| 0137     | The agent waits for a background process with a tool, not a sleep                            | 0147                         |
| 0166     | The platform owner cleans up Docker leftovers                                                | 0219                         |
| 0167     | Aven is licensed under the MIT license                                                       | 0315                         |
| 0169     | A sandbox mints identity tokens through a relay on its runner                                | 0219                         |
| 0171     | Doctor and the runner check that a sandbox reaches its runner                                | 0219                         |
| 0197     | The Environment card takes a snapshot                                                        | 0219                         |
| 0199     | The Browser shows a port of the sandbox                                                      | 0219, and its ports are 0237 |
| 0201     | The Environment card asks the runner for the snapshot                                        | 0219                         |
| 0203     | The agent is told how the Browser shows its pages                                            | 0219                         |
| 0212     | Thread folders are personal, kept on the server and drawn before the server answers          | 0293                         |
| 0218     | A runner serves folders, and a project is one of them                                        | 0219                         |
| 0268     | Threads and bot chats can have a font of their own                                           | 0270                         |
| 0290     | The runtimes list is a card with load tiles and a trend                                      | 0363                         |
| 0294     | CI and Hammer run on Blacksmith runners                                                      | 0295                         |
| 0302     | e2e runs on the pull request that stages into main, and main takes only staging              | 0314                         |
| 0312     | Hammer reviews every pull request but the one from staging to main                           | 0314                         |
| 0316     | Husky runs the fast CI checks before a commit                                                | 0394                         |
| 0322     | The Aven theme is neutral gray                                                               | 0382                         |
| 0346     | Icons come from Solar                                                                        | 0360                         |
| 0391     | The e2e suite runs before the push that makes a branch                                       | 0394                         |

## Superseded in part (54)

These hold, except for the part named.

| Decision | What it decided                                                         | Superseded in part by            |
| -------- | ----------------------------------------------------------------------- | -------------------------------- |
| 0003     | Agent engine: tools and background jobs                                 | 0012                             |
| 0004     | Server-owned runs and the SSE protocol                                  | 0012                             |
| 0005     | Projects are real; threads always belong to one                         | 0010                             |
| 0006     | Model providers belong to the user                                      | 0012                             |
| 0007     | The model and reasoning effort are chosen per message                   | 0012                             |
| 0008     | One control plane, many runtimes, many clients                          | 0219                             |
| 0012     | The agent's tools come from the sandbox                                 | 0219                             |
| 0013     | Projects are imported GitHub repositories                               | 0218 and 0219                    |
| 0019     | Azure OpenAI is a provider kind                                         | 0025                             |
| 0031     | The portal shows a thread's files, read-only                            | 0032                             |
| 0035     | The agent has skills                                                    | 0365                             |
| 0040     | A person ships a thread as a pull request                               | 0041 and 0044                    |
| 0041     | Shipping acts as the person, with their GitHub token                    | 0044                             |
| 0042     | The agent can fetch from GitHub, through the runner                     | 0044                             |
| 0044     | The agent acts as the person on GitHub, and shipping is an agent run    | 0069 and 0276                    |
| 0045     | A project has environment variables and secrets, set in the app         | 0219                             |
| 0053     | A person can open a shell in a thread's sandbox from a Terminal panel   | 0219                             |
| 0057     | The agent can hand tasks to subagents                                   | 0390                             |
| 0058     | Bots are agents that talk by sending messages                           | 0059                             |
| 0059     | A bot has a computer of its own, on a runner                            | 0219                             |
| 0063     | The main bot can message other bots                                     | 0271 and 0065                    |
| 0065     | Bots message each other as in the harness                               | 0271                             |
| 0073     | Aven installs and updates with one script                               | 0219                             |
| 0074     | The GitHub App is created from the platform                             | 0219                             |
| 0088     | A bot works the person's threads                                        | 0101                             |
| 0091     | The sidebar shows a row for each machine, with how loaded it is         | 0103                             |
| 0099     | The platform is set in Mona Sans                                        | 0110                             |
| 0109     | Agents work the cockpit                                                 | 0120                             |
| 0117     | A message sent shows at once                                            | 0287                             |
| 0118     | Archiving a thread stops its work and frees its sandbox                 | 0219                             |
| 0148     | The control plane can update to the newest release                      | 0388                             |
| 0153     | Nothing is unshipped when the branch adds nothing to the default branch | 0232                             |
| 0155     | Color themes, each with light and dark                                  | 0224                             |
| 0159     | A thread that finished while it was not open shows a dot                | 0331                             |
| 0172     | The projects route is two columns, with the threads beside the projects | 0196 and 0275                    |
| 0205     | A mention of a person marks the thread until it is opened               | 0331                             |
| 0209     | A thread keeps its message draft                                        | 0341                             |
| 0214     | The ship bar does not hold an invisible place                           | 0286                             |
| 0215     | A thread row has one actions menu                                       | 0224                             |
| 0221     | A runtime's machine is persistent or ephemeral                          | 0222                             |
| 0225     | `setup-env` is a skill that writes a script, with no snapshot           | 0326                             |
| 0227     | A bot chooses the runner of its computer                                | 0324                             |
| 0229     | A persistent runner ships with its own GitHub login                     | 0276                             |
| 0242     | The Claude agent runs on a setup token                                  | 0309                             |
| 0248     | Dismissible notices are kept per person in the database                 | 0288                             |
| 0292     | Aven is the default theme                                               | 0396                             |
| 0297     | A boat.dev sandbox is a runtime                                         | 0299                             |
| 0299     | Aven Cloud is a sandbox per thread, and a repository is a project       | 0308, 0328, 0348 and 0392        |
| 0300     | The Claude agent is behind a flag                                       | 0309                             |
| 0301     | The Codex agent is behind a flag                                        | 0309                             |
| 0308     | An Aven Cloud sandbox is stopped when it is idle                        | 0392                             |
| 0326     | A project's environment is a saved snapshot, for 72 hours               | 0392                             |
| 0379     | The Codex agent runs on an API key                                      | 0309, and its credential is 0321 |
| 0381     | The installation's one sandbox platform is chosen in Settings > Sandbox | 0328 and 0392                    |
