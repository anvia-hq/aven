# Compose runs without the environment's copy of the install's `.env`

Status: accepted. See `docs/bugs/0007`.

## Context

`aven update` from inside `~/.aven/server` wrote the new `AVEN_VERSION` to `.env`, ran `docker compose up -d`, and left the containers on the old version. The binary had loaded that directory's `.env` into its own environment at start, and Compose gives the environment priority over `.env`.

## Decision

- **The release binary does not load `.env` or `bunfig.toml` from the directory it is run in** (`--no-compile-autoload-dotenv --no-compile-autoload-bunfig`, in `build-release.sh` and the package's `build` script). `aven` has no use for either, and a `.env` of some project in the current directory should not become the environment of a runner or its agents.
- **Every compose command of a server install runs without the variables the install's `.env` defines**, so Compose reads them from that file alone, whatever is in the environment. This holds for a binary that still loads the directory's `.env` and for one the shell gave variables to.

## Consequences

- A person who sets `AVEN_VERSION=x aven update` in the shell no longer overrides the install's `.env` for Compose; `--release` is the way, and the file is the record.
- A runner started from a directory with a `.env` no longer sees its variables.
