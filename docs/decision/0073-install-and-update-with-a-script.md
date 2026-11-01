# Aven installs and updates with one script

Status: accepted. Replaces the nginx image of `apps/platform` and the control plane's stale Dockerfile.

## Context

Running Aven meant cloning the repository, `bun install`, `createdb`, writing about thirty variables by hand, building the multi-gigabyte sandbox image and starting `bun run dev`. Nothing was published: no release, no image, no compose file, and `apps/control-plane/Dockerfile` dated from the first commit and could not run the control plane any more. Multica installs with `curl ... | bash`, which fetches what is missing, writes a `.env` with random secrets, pulls images, starts the stack and installs a CLI; running it again upgrades.

## Decision

- **A tag `vX.Y.Z` publishes three images and a binary.** `ghcr.io/anvia-hq/aven-server` (control plane, migrations on start), `aven-web` (the built platform behind Caddy) and `aven-sandbox` (multi-arch, pulled by runners instead of built), and the `aven` binary for darwin and linux, arm64 and amd64, as GitHub Release assets. The repository is public, so none of it needs credentials.
- **The server is `deploy/docker-compose.yml`: Postgres, `server`, `web`.** It runs with `AVEN_LOCAL_RUNNER=off`: sandboxes are containers on a Docker daemon, and a server container has no business with its host's. `deploy/docker-compose.build.yml` builds from a checkout instead of pulling. `deploy/env.example` is the settings of a self-hosted install; the root `.env.example` stays the development one.
- **`web` is Caddy**, the one published port. `/api/*` goes to the control plane with the prefix stripped (the Vite proxy's contract, which nginx did without WebSocket upgrades), everything else is the platform with a single-page fallback. `AVEN_SITE_ADDRESS` is `:80`, or a domain for which Caddy gets a certificate, so HTTPS needs no further service.
- **A runner is another computer.** One control plane has any number of runners, on its machine or elsewhere. A runner needs Docker, `git`, the `aven` binary and the sandbox image, and connects out to `<origin>/api` (`AVEN_URL`, the runner appends `/runtimes/connect`; the model gateway paths are relative to it). `aven` installs it as a launchd or systemd user service.
- **`install.sh` has two modes over one CLI.** By default it installs the server and a runner on the same machine; `--runner --url <origin> --token <token>` installs only a runner, and Settings > Runtimes shows that command with the token filled in. The script checks and, with the person's yes, installs what is missing (Docker, `git`), writes `.env` with random secrets and keeps an existing one, pulls, starts, waits for `/health` and opens the browser. It is fetched from `raw.githubusercontent.com/anvia-hq/aven`, with no host other than GitHub's API hard-coded, so `aven.anvia.dev` can redirect to it later.
- **`aven update` updates everything on the machine it runs on**: resolves the release, pulls the images (migrations run when the server starts), replaces its own binary, restarts the runner and pulls a new sandbox image. `AVEN_VERSION` pins a release. A runner reports its version when it connects, and Settings > Runtimes marks one that is behind; the runtime wire version stays the hard check.

## Consequences

- Server state is Postgres and nothing else (the control plane only writes temporary files), so a backup is a dump of one database and `docker compose down` never loses anything but `-v`.
- A runner on a public control plane connects over `wss://`, which is why the Caddy domain mode is part of the first version and not an extra.
- GHCR makes a package private on its first push. After the first release, set `aven-server`, `aven-web` and `aven-sandbox` to public once (Package settings > Danger zone); the `org.opencontainers.image.source` label in each Dockerfile links them to the repository. Pushing a tag then needs no further steps (`.github/workflows/release.yml`).
- The sandbox image is pulled once per runner machine and is several gigabytes.
- Built in steps, each its own commit: the images and compose file, CI that publishes them, the `aven` CLI and runner service with a local token bootstrap, `install.sh` and the "Add runner" command, the runner version badge, then the GitHub App manifest flow, which removes the last hand-made setup (an installation cannot import a repository until a GitHub App exists).
- Not done: Windows (WSL2 later), and auto-update of runners.
