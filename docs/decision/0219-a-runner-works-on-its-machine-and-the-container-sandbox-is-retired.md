# A runner works on its machine, and the container sandbox is retired

Status: accepted. Follows 0218, which made a runner able to work on its own machine and a project a folder on it. Supersedes the container sandbox (0008, 0095, 0211 for macOS VMs stays a separate question), the Desktop (0015, 0039, 0059), the Browser (0199, 0203), environment snapshots (0043, 0197, 0201), the sandbox image and its release (0073's `aven-sandbox`), and the GitHub import (0013, 0074, 0123) as the way to make a project.

## Context

0218 built a runner that works on the machine it runs on, with a folder as a project, and it was tried for real: a thread worked in its own clone of a folder, with the machine's Docker, git and tools. There are no installations of Aven that depend on the container, so nothing has to be migrated, and keeping a second way to run a thread (a Docker container, a 9 GB image built and released with every version, a desktop, a browser proxy and a snapshot store) costs more than it gives once the first works.

## Decision

- **A runner has one mode: it works on its machine.** The Docker sandbox, the image it ran, `AVEN_SANDBOX_IMAGE` and the rest of the container settings, the leftovers and archived-thread cleanup that cleaned up containers, the environment snapshots (`.aven/setup` as the thing a snapshot was made from, Take snapshot, `environment.save` and `environment.read`) and the sandbox image's release are removed. `AVEN_SANDBOX=host` is no longer needed; a runner has `AVEN_DIRS` and nothing else to choose.
- **The Desktop and the Browser are removed**, with the noVNC panel and viewer relay, the desktop tools of the agent, the port proxy, the browser origin and its token, and a bot's desktop. A person watches the thread, its files, its changes and its terminal. What the agent builds, the person opens in their own browser on the machine or over its network.
- **The Terminal stays.** It is a shell on the runner's machine in the thread's folder, drawn by xterm as before, for the person the thread's latest run was sent as.
- **A project is a folder on a runner.** The GitHub import is not offered; a project that is a git repository still has its branch, and Ship has the agent open the pull request with the machine's own `gh`. The GitHub app and its settings stay for a person who connects an account to ship from the platform, and are not needed to make a project.
- **A runner built for the container cannot connect.** The runtime wire version changes, and a runner that speaks the old one is refused with the usual message. There is no migration of container threads: nobody runs them yet.

## Consequences

- A runner no longer needs Docker. It needs `git` and a user account whose access is what the agent has.
- A release makes the server, web and CLI images and the CLI archives; there is no `aven-sandbox` image to build, pull, update or remove, so a release is much shorter, and `aven update` no longer pulls a sandbox image on a runner.
- The agent has no desktop: it cannot take a screenshot of an app or click in it, and it has no Browser tab to show a page it serves. Tools that need a display are the machine's own.
- A bot's computer is a folder on a runner too, with no desktop.
- The e2e tests of the Desktop and the Browser, and the decisions about them, stay as history in `docs/decision/`.
- macOS VM sandboxes (0211, an open pull request) are not part of this: a Mac runner works on the Mac itself.

## Not verified

The runner was tried on one Mac with a git folder and a plain folder. Removing the container is a large deletion; what it touches is listed by the compiler and the tests, and a thread through the web app is the proof that nothing the host mode needed went with it.
