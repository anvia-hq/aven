---
name: setup-env
description: Set up or refresh this repository's development environment. If .aven/setup already exists, runs and verifies it without rewriting working files (making only targeted fixes if something fails or the user asked to change it). Otherwise writes .aven/setup, a Set up action in .aven/actions.yml, and optionally .aven/resume (per-thread workspace hydration on Aven Cloud) and .aven/stack (dev services). On an Aven Cloud sandbox it also calls save_environment to snapshot the machine for 72 hours.
---

# Setting up the environment

A thread works in its own fresh clone of the project. Tracked files are there, but git-ignored files (`node_modules`, virtualenvs, build output, `.env`) are not.

Check which kind of computer you are on **first**:

- **Aven Cloud sandbox** (you have the **`save_environment`** tool): `save_environment` runs `.aven/setup` in a clean environment with `CI=1 AVEN_CLOUD=1` and snapshots the disk for **72 hours**. System packages, toolchains, and home-directory caches (`~/.bun`, `~/.npm`, `~/.cache`, `~/.cargo`, `~/.local`, Playwright browsers) carry over to new threads. Because each new thread still clones into its **own** fresh workspace directory, workspace-local files (`node_modules`, `.venv`, `.env`) do **not** carry over automatically — **`.aven/resume`** runs automatically when a sandbox thread starts (up to 2 minutes, with project variables and `AVEN_CLOUD=1`) to hydrate the workspace quickly from those warm caches and start services.
- **Person's own computer** (no `save_environment` tool): there is no snapshot and `.aven/resume` is not run automatically. `.aven/setup` runs when the person presses **Set up** (or asks you to run it).

## 0. Check what already exists first

Before reading docs or writing anything, check whether `.aven/setup`, `.aven/resume`, `.aven/stack`, and `.aven/actions.yml` already exist.

**If `.aven/setup` already exists:**

1. **Do not rewrite it.** Read it to see what it does, then test it as-is under a bare environment:
   - On an Aven Cloud sandbox: `env -i HOME="$HOME" PATH=/usr/bin:/bin CI=1 AVEN_CLOUD=1 bash .aven/setup`
   - On a person's computer: `env -i HOME="$HOME" PATH=/usr/bin:/bin CI=1 bash .aven/setup`
2. **If it succeeds and the user did not ask to change it:** leave `.aven/setup` and `.aven/actions.yml` untouched. On a sandbox, check that `.aven/resume` (if present) passes, call **`save_environment`** to refresh the snapshot, and skip straight to step 7.
3. **If it fails, or the user asked for a specific change:** diagnose the exact failure and make the **smallest targeted edit** needed. Keep existing structure, conventions, and unrelated lines intact. Never reformat or rewrite working sections.

Only go through steps 1–3 in full when `.aven/setup` does not exist yet (or the user explicitly asked to rebuild it from scratch).

## 1. Learn what the project needs

Read in this order, stopping once you have the facts:

- `README`, `CONTRIBUTING`, `AGENTS.md`, `CLAUDE.md`: setup commands and caveats;
- the package manager and lockfile (`bun.lock`, `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `uv.lock`, `poetry.lock`, `requirements.txt`, `Cargo.lock`, `go.sum`, `Gemfile.lock`): always use that manager;
- runtime version files: `.tool-versions`, `.mise.toml`, `.nvmrc`, `.node-version`, `.python-version`, `rust-toolchain.toml`, `go.mod`, `engines` in `package.json`;
- `.github/workflows`: what CI installs and checks;
- `flake.nix`, `devbox.json`, `Dockerfile`, `docker-compose.yml`: toolchains and services;
- what this machine already has (`node -v`, `bun -v`, `python3 --version`, `docker info`) under the bare `PATH` below.

### Match the repository's versions

- Note the version of every runtime and service the repository names and **where it says so**. When two files disagree, **CI wins**, then compose/Dockerfile, then the README — tell the user which you followed.
- Match at least the **major** version.
- **Never substitute silently.** If you cannot get the version the repository names, tell the user what you would use instead and why, and ask.

## 2. Choose how the toolchain gets in

Use what the repository already uses and add nothing unnecessary:

| The project has                   | `.aven/setup` does                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `flake.nix`                       | enters it with `nix develop -c` if `nix` is installed; otherwise says nix is needed and stops |
| `devbox.json`                     | runs through `devbox run` if `devbox` is installed; otherwise says so and stops               |
| `.mise.toml` or `.tool-versions`  | runs `mise install` and uses `mise exec --` if `mise` is installed                            |
| only a lockfile and version files | checks the machine's tools and their versions                                                 |
| `docker-compose.yml` for services | leaves service startup to `.aven/stack` (`docker compose up -d` + wait for ports)             |

If the project pins versions and has no version manager, **ask the user** before suggesting `mise`; give them the install command rather than running it on their laptop.

## 3. Write `.aven/setup`

Make `.aven/setup` executable (`chmod +x .aven/setup`) and runnable from any directory. Structure it as a **doctor first, installer second**:

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

if [ -f .env.example ] && [ ! -f .env ] && git check-ignore -q .env 2> /dev/null; then
  cp .env.example .env
  echo "step     .env made from .env.example"
fi
```

Rules for `.aven/setup`:

- **Cloud vs. local machine guard.** Never run `sudo`, `apt`, `brew install`, or `curl | sh` on a person's own computer. Only install missing system packages when `[ "${AVEN_CLOUD:-}" = "1" ]` (set automatically on Aven Cloud sandboxes). Outside Aven Cloud, print the exact install command (`brew install ...` / `sudo apt-get install ...`) and exit 1.
- **Plain shell `PATH`.** Commands run via `bash -c` without `~/.zshrc` or `~/.bashrc`, so always prepend standard user tool directories to `PATH` inside the script.
- **Never destructive.** A folder project can be the person's real working directory — never run `git clean` or `rm -rf` outside folders the script created.
- **Frozen, quiet, idempotent, non-interactive.** Install from the lockfile with its frozen/locked flag, pass `-y` / rely on `CI=1`, quiet noisy install logs where possible, and start no long-running servers.
- **No secrets and no hard dependency on project variables.** The script is committed, and `save_environment` runs it under `env -i` (without project variables). List unset variables from `.env.example` / README as `note` lines (names only) pointing to **Settings > Variables**, and never exit non-zero just because a secret variable is unset during setup. Note that Aven rejects `PATH`, `HOME`, `USER`, `SHELL`, `PWD`, and anything starting with `LD_`, `AVEN_`, `GH_`, `GITHUB_`, or `GIT_` (case-insensitive) as project variables; if the app requires one of those names, ask the user before adding an alias in app code.
- **Keep `git status` clean.** Only create `.env` from `.env.example` if `.env` is git-ignored.

## 4. Per-thread hydration (`.aven/resume`) and services (`.aven/stack`)

### `.aven/resume` (for Aven Cloud sandboxes)

On an Aven Cloud sandbox, new threads clone into a fresh workspace folder on top of the saved disk snapshot. Write an executable `.aven/resume` whenever a fresh clone needs fast workspace hydration (such as `node_modules`, `.venv`, `.env`, or starting services):

- Keep it fast and idempotent (runs automatically on sandbox wake, up to **2 minutes**, with `AVEN_CLOUD=1` and the project's variables).
- Hydrate dependencies from the warm caches populated by `.aven/setup` (e.g. `bun install --frozen-lockfile --offline --silent || bun install --frozen-lockfile --silent`), copy git-ignored `.env` if needed, and call `bash .aven/stack` if services are required.
- Put no secrets in `.aven/resume` — it is committed.

### `.aven/stack` (optional, when the project needs services)

If the project needs a database, queue, or other background service:

- Start the services (`docker compose up -d <services>`, or local service on a sandbox without Docker) and wait until each port responds.
- **Do not start the dev server in the script** and never background processes with `&`. The agent starts dev servers using its process tools (`list_ports` / `wait_for_port`).
- Derive per-thread ports from the workspace folder (`offset=$(( $(pwd | cksum | cut -d' ' -f1) % 100 ))`) and write them to a git-ignored `.env.local` so concurrent threads on one machine do not collide.

## 5. Verify

- Run `.aven/setup` under a bare environment:
  - Cloud sandbox: `env -i HOME="$HOME" PATH=/usr/bin:/bin CI=1 AVEN_CLOUD=1 bash .aven/setup`
  - Local computer: `env -i HOME="$HOME" PATH=/usr/bin:/bin CI=1 bash .aven/setup`
- If you created or edited `.aven/setup`, run that same command **one more time** to confirm the second run is a fast no-op.
- If you created or edited `.aven/resume`, run `AVEN_CLOUD=1 bash .aven/resume` once and confirm it exits 0 quickly.
- Check `git status` to make sure running setup did not leave untracked or modified project files behind (other than intended `.aven/*` edits).
- If a check fails because the user's computer lacks a system tool, report the exact command to install it — do not work around it silently.

## 6. Save snapshot (sandbox) and ensure the `Set up` action

- **On an Aven Cloud sandbox**, once step 5 passes, call **`save_environment`**. It runs `.aven/setup` with `CI=1 AVEN_CLOUD=1` in a clean environment and saves the disk snapshot for 72 hours. If it fails, read the error tail, make a minimal fix, and call it again.
- **In `.aven/actions.yml`**: if a `Set up` action already exists, **leave `.aven/actions.yml` untouched**. Otherwise add it (preserving any existing actions; read `setup-actions` for format limits):

```yaml
actions:
  - name: Set up
    run: bash .aven/setup
```

## 7. Tell the user

Summarize concisely:

- whether existing `.aven/*` files were kept as-is or what minimal edits were made;
- the versions matched and where the repository specifies them (plus anything missing for the user to install, with the exact command);
- on a sandbox, whether `save_environment` succeeded and when it expires;
- if any `.aven/*` files were created or changed, remind them to commit `.aven` so other threads get the changes, and mention `/setup-actions` and `/setup-ship` if not set up yet.

Do not commit or push anything yourself unless the user asks.
