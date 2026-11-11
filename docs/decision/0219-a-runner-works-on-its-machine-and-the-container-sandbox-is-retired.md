# A runner works on its machine, and the container sandbox is retired

Status: accepted. Follows 0218, which made a runner able to work on its own machine and a project a folder on it. Supersedes the container sandbox (0008, 0009, 0010, 0012, 0014, 0016, 0037, 0038, 0072, 0095, 0113, 0127, 0128, 0166, 0169, 0171; 0211's macOS VM idea is dropped), the Desktop (0015, 0039; 0059 in part), the Browser (0199, 0203), environment snapshots (0043, 0197, 0201), the sandbox image and its release (0073's `aven-sandbox`), and the GitHub import (0013, 0074, 0123) as the way to make a project.

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

## What the agent's commands inherit

A host-mode command and shell run as the runner's user, so they would inherit the runner's own environment, with its token (`AVEN_RUNTIME_TOKEN`) and, in the control plane's built-in runner, the server's secrets. `withoutRunnerSecrets` drops every `AVEN_*` variable and any name that looks like a secret (`SECRET`, `PASSWORD`, `PRIVATE_KEY`, `API_KEY`, `*_TOKEN`, `DATABASE_URL`) from what a command and the Terminal start with; what a project gives a thread is added after it. The agent still runs as the user and can read their files, which 0218 states.

Continuing a thread on another runner looks the runner up as the person, so a private host runner of someone else cannot be chosen.

## A fork copies on write, or shares the git objects

A fork of a git folder is a copy of its parent's clone, with uncommitted work and ignored files. `copyTreeSharingObjects` makes it copy-on-write where the filesystem can (`clonefile` on macOS, `cp --reflink=always` on Linux). On one that cannot, such as ext4, it copies the working files and hard-links `.git/objects`, which git never changes in place, so history costs no space. A worktree is not used: the host-side git expects a standalone `.git`. A folder that is not a git repository has no clone and no copy.

## A runner is its owner's, and a thread is what is shared

A host runner is usable only by its owner: only they can put a project on it or start a thread there. There is no switch to share the computer. A teammate gets in through a thread: when its owner shares the thread with the workspace and turns on multiplayer, a teammate can send messages to its agent, which acts as the owner on their computer. The owner turning that on for one thread is the consent, and a workspace's people are trusted by the person who shares. 0218's Share switch on a runner is removed (the `shared` column stays, unused). The control plane's own runner (`AVEN_LOCAL_RUNNER=host`) has no owner, so it is the workspace's, as before 0218; set `AVEN_LOCAL_RUNNER=off` to keep a server's machine out of reach.

## Choosing a folder by browsing

Add a folder lists the folders a runner serves and the folders under them, and can make a new one, through two runner calls, `folders.list` and `folders.create`, relayed by the control plane (`GET` and `POST /runtimes/:id/folders`, for a person who may use the runner). The runner refuses every path outside what it serves, through a link too, and hides folders that start with a dot; a git folder is marked. They are new calls and not a new field of the wire, so `WIRE_VERSION` stays 56: a runner that does not know them answers `Unknown call` and the person is told to update it. The Terminal opens with a line saying which folder the thread works in and a prompt with the project's name and branch, not the workspace's uuid.

## A folder project's page

The page of a project that is a folder shows its files and its README the way a GitHub project's page does, read from the computer instead of GitHub. Two more runner calls, `folders.files` (the entries of the folder, or of a folder in it, from the project's root) and `folders.readme` (its README, case ignored, cut at the same length as GitHub's) and `folders.commits` (the history of the folder's checked-out branch, ten to a page like GitHub, each with the branches and tags on it, read with `git log` on the runner), are relayed by the control plane through the same `GET /projects/:id/files` and `/readme`, for a person who may use the runner; another person is refused. The runner keeps every path inside the project's folder, through a link too, hides `.git` and shows other dot files. Folders come before files. A file has no page to open, so its row is not a link; links and images in the README that point inside the folder are not shown as links, those to a web address are. Like `folders.list` these are calls and not a new field of the wire, so `WIRE_VERSION` stays 56. A folder that is not itself the root of a git repository, or has no commits yet, shows no Commits section: a folder inside another repository does not show that repository's history. A commit has no page to open, so it is not a link. A folder project has no default branch and no pull requests, so its About panel and sections leave those out.
