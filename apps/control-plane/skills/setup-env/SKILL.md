---
name: setup-env
description: Set up this repository's environment so a thread can install, check and run it, by writing .aven/setup (a script that checks the machine and installs from the lockfile), optionally .aven/stack (starts the services the dev stack needs), and a Set up action to start it with one press. Use when the user asks to set up the environment, when a new thread keeps failing for missing dependencies or tools, or when the project needs a toolchain, a database or a service.
---

# Setting up the environment

A thread works in its own clone of the project, on the runner's own computer. The tracked files are there, but what git ignores (`node_modules`, virtualenvs, build output, `.env`) is not, and nothing keeps it from one thread to the next. This skill writes `.aven/setup`, a script that checks the machine and installs what the project needs, and an action that starts it. There is no snapshot: the script runs when a person asks for it, and again whenever a thread needs it.

## What shapes the script

- **It runs on the person's own computer.** Never `sudo`, `apt`, `brew install`, or a `curl | sh`. When a system package or a tool is missing, the script prints the exact command for the person to run (`brew install vips` on macOS, `sudo apt-get install libvips-dev` on Debian) and stops.
- **A command gets a plain shell**: `bash -c`, with no login shell and no `~/.zshrc` or `~/.bashrc`, and the `PATH` the runner's service had when it was installed. A tool that a shell profile puts on `PATH` (mise shims, nix, nvm, Homebrew) may be missing. So the script sets `PATH` itself, as in the example below, and you test it under a bare environment (step 5).
- **A project can be the person's real folder** (a folder that is not a git repository, which a thread works in directly). The script must never delete or reset anything: no `git clean`, no `rm -rf` outside folders it made.
- **No secrets.** The script is committed. A command gets the project's variables in its environment; the script reads them and never writes a value.

## 1. Learn what the project needs

Read, in this order, and stop when you know enough:

- the README, `CONTRIBUTING`, `AGENTS.md`, `CLAUDE.md`: they often name the setup commands;
- the package manager and its lockfile (`bun.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `uv.lock`, `poetry.lock`, `requirements.txt`, `Cargo.lock`, `go.sum`, `Gemfile.lock`): use that manager's commands, never another's;
- the runtime versions: `.tool-versions`, `.mise.toml`, `.nvmrc`, `.node-version`, `.python-version`, `rust-toolchain.toml`, `go.mod`, `engines` in `package.json`;
- the CI workflows in `.github/workflows`: what CI installs is what the project needs;
- a `flake.nix`, `devbox.json`, `Dockerfile` or `docker-compose.yml`: the toolchain and services it already names;
- what the machine has: `node -v`, `bun -v`, `python3 --version`, `docker info`, under the same bare `PATH` the script will get.

### Follow the repository's versions

The repository already says which versions it runs on. Match them; do not take whatever the machine happens to have.

- Write down, before you write the script, the version of every runtime and service the project names and **where it says so** (image tags in compose, `setup-*` versions in CI, `.tool-versions`, `engines`, a `Dockerfile`'s `FROM`). When two sources disagree, CI wins, then compose, then the README, and say which you followed.
- Match at least the **major** version. A database or runtime one major off is a different environment.
- **Never substitute silently.** If you cannot get the version the repository names, tell the user what you would use instead and why, and ask.

## 2. Choose how the toolchain gets in

Use what the project already uses, and add nothing it does not need:

| The project has                   | The script does                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `flake.nix`                       | enters it with `nix develop -c`, if `command -v nix` finds nix; otherwise says nix is needed and stops |
| `devbox.json`                     | runs through `devbox run`, if devbox is installed; otherwise says so and stops                         |
| `.mise.toml` or `.tool-versions`  | `mise install`, and runs tools through `mise exec --`, if mise is installed                            |
| only a lockfile and version files | uses the machine's own tools, and checks their versions                                                |
| `docker-compose.yml` for services | `docker compose up -d` for the services it names, then waits for their ports                           |

If the project names versions and has no tool that installs them, **ask the user** whether to use mise (it is one binary, installed in the home folder with no root). Give them its install command to run; do not run it for them.

## 3. Write `.aven/setup`

An executable script at `.aven/setup`, run from anywhere (it changes to the repository root). Make it a doctor first and an installer second, so that it also tells the agent what is wrong:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$HOME/.bun/bin:$HOME/.cargo/bin:$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

missing=0
need() {
  if command -v "$1" > /dev/null; then
    echo "ok       $1 $("$1" --version 2>&1 | head -n 1)"
  else
    echo "missing  $1: $2"
    missing=1
  fi
}

need git "install git"
need bun "curl -fsSL https://bun.sh/install | bash"
[ "$missing" -eq 0 ] || { echo "Install what is missing above, then run this again."; exit 1; }

echo "step     dependencies"
bun install --frozen-lockfile --silent

if [ -f .env.example ] && [ ! -f .env ]; then
  cp .env.example .env
  echo "step     .env made from .env.example"
fi
```

Rules for it:

- **One line per check and per step**, so a failure is easy to find. Quiet the installs (`--silent`, `> /dev/null`) where a tool allows it.
- **From the lockfile, with the frozen or locked flag**, so the result is the same each time.
- **Idempotent.** A second run changes nothing and takes seconds.
- **No long-running processes**, and no interaction (`-y`, `CI=true`). Build things; do not start servers here.
- **Variables.** List the names the project reads and does not have set (check `.env.example`, the README, `process.env` in the code), names only, and point to **Settings > Variables**. Aven refuses these names as project variables: `PATH`, `HOME`, `USER`, `SHELL`, `PWD`, and anything starting `LD_`, `AVEN_`, `GH_`, `GITHUB_` or `GIT_`, in any letter case. If the project reads `GITHUB_APP_ID` or the like, tell the user, and let them choose whether the project should also read an allowed name (`MYAPP_GITHUB_APP_ID`). Change the project's code only after they choose.
- **Keep it short.** Install what a thread needs to start working, not everything the project could ever use.

Then `chmod +x .aven/setup`.

## 4. Optional: `.aven/stack`

If running the project needs services (a database, a queue) or a dev server, write `.aven/stack`, the same way: start the services (`docker compose up -d <services>`), wait for each port, and print how to start the dev server. **Do not start the dev server in the script.** The agent starts it as a process with its process tools, so that it is listed and its output can be read; `list_ports` and `wait_for_port` show when it is up. Do not use `&` in a command.

Two threads of one project can run on the same computer at once. If the stack binds fixed ports, make them per thread: take an offset from the folder (`offset=$(( $(pwd | cksum | cut -d' ' -f1) % 100 ))`), write the ports to a git-ignored `.env.local`, and print them.

## 5. Check it

Run it **twice** here and read the output: the second run should be a quick no-op. Then run it as the runner would, with a bare environment, so a tool that needs your profile shows up:

```sh
env -i HOME="$HOME" PATH=/usr/bin:/bin bash -c '.aven/setup'
```

Fix what fails. If a check fails because the computer lacks something, that is the answer to give the user, not something to hide.

## 6. Add the action

Add a `Set up` action to `.aven/actions.yml` so a person starts the script from the thread's **Actions** button (it then runs under **Background tasks** with its output and exit code). Use `bash` so that the file's executable bit does not matter. If the file exists, add to it and keep what is there; for the format and its limits, read `setup-actions`.

```yaml
actions:
  - name: Set up
    run: bash .aven/setup
```

## 7. Tell the user

In a few lines:

- what the script installs, with the **version of each runtime and service and where the repository names it**, and any difference you asked about first;
- what it does **not** install, with the exact command for the person to run;
- that **`.aven` must be committed** (with the Ship button, or you can commit it if they ask), or other threads will not have it;
- that the next steps are `/setup-actions` for the checks they want as buttons and `/setup-ship` for how changes are shipped, and that a line such as "run `.aven/setup` before building" in `AGENTS.md` makes every agent that works there do it, if they want it.

Do not commit or push anything yourself unless the user asks.
