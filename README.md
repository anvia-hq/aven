# Aven

Aven runs AI coding agents on your own machines. A control plane (API, web app, database) hands each
thread to a **runner**, a computer with Docker that gives the agent a sandbox with a desktop, a
terminal and your repository.

## Install

macOS or Linux, with nothing installed beforehand:

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash
```

It installs what is missing (git and Docker, after asking), then the `aven` command, then the
server and a runner on this machine, and opens Aven in your browser. Create your account, add an AI
provider in Settings and start a thread. On Windows, use WSL2.

Everything lives in `~/.aven` (the server's `.env` with its secrets, the runner's settings and log).

## More runners

One server can have any number of runners: a laptop, a build machine, a cloud VM. In **Settings >
Runtimes** create a runner, copy its token and run this on the machine:

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- \
  --runner --url https://aven.example.com/api --token avrt_...
```

## Update

Run the install command again, or:

```sh
aven update
```

It moves the `aven` command, the server and the runner on that machine to the latest release. A
server's runners are updated one machine at a time, the same way. Pin a release with
`aven update --release 0.3.0`.

## The `aven` command

```
aven install [--port N] [--origin URL] [--owner-email E]   server + runner on this machine
aven install --runner --url <address> --token <token>      only a runner
aven start | stop | restart | status | logs [--follow]     the server
aven runner start | stop | restart | status | logs | uninstall
aven update [--release X]
aven doctor                                                check Docker, git, the server and the runner
```

`aven stop` keeps the database. Settings are in `~/.aven/server/.env`; edit it and run
`aven restart`. See [`deploy/env.example`](deploy/env.example) for what each one does.

## Development

Bun workspace monorepo; read [AGENTS.md](AGENTS.md) first, and `docs/` for rules and decisions.

```sh
bun install
createdb aven
cp .env.example .env     # then fill it in
bun run dev
```

Install and release design: [docs/decision/0073](docs/decision/0073-install-and-update-with-a-script.md).
