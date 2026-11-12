# A persistent runner ships with its own GitHub login

Status: accepted. Refines 0044 and 0192 for a project that has no GitHub app, and gives runners a lifetime.

## Context

0044 gives a run the sender's GitHub token, and 0192 never lends a teammate the creator's. Both rest on the project having a GitHub app installation. A project with none, such as a folder project (0218), has no app key, so the ship bar never asked for a GitHub account, `connected` stayed unknown and the Ship button was a placeholder for ever, although `ship` itself skips the GitHub checks for such a project and the agent already uses the machine's own `gh` and git login on a runner (`HostSandboxes` has no sign-in).

Runners are about to be of two kinds: a persistent one, a machine someone keeps (a Mac mini, a home server), and an ephemeral one, a VM or sandbox made for work and thrown away. A persistent machine's own login is its owner's choice; an ephemeral one has none worth trusting, and whatever is signed in there was put there by Aven.

## Decision

- **A runner has a lifetime**, `persistent` or `ephemeral` (`runtimes.lifetime`, default `persistent`, so every runner that exists is persistent). Nothing sets `ephemeral` yet; the provider of such a runner will.
- **A project with no GitHub app ships with the persistent runner's own login.** `GET /threads/:id/ship` says `machine: true` for it, the ship bar counts GitHub as connected and shows Ship, and the agent uses whatever `gh` and git the machine has. Aven does not check that the machine is logged in: if it is not, the agent says so, as it does in a folder project today.
- **An ephemeral runner never uses a login of its own.** A project with no app on one is not `machine`, the bar offers Connect GitHub, and `POST /threads/:id/ship` refuses with a message that says the runner is temporary.
- **A project with an app is unchanged**: the person's connection is checked, and the run acts as them.
- **The bar no longer waits for ever.** Readiness answered with no app key and no machine login is "not connected", not "not asked yet".

## Consequences

- On a persistent runner without an app, shipping acts as whoever is logged in on that machine, not as the person who pressed Ship. That is the trade-off: the machine's owner chose that login, and a teammate on a shared host runner (0192's case) ships as the owner there.
- `Open a PR` is not offered for such a project, since Aven cannot ask GitHub about the branch without an app.
- `devscalelabs-1` and `homelab` have no `gh`; a thread there still cannot open a pull request until one is installed and logged in.
