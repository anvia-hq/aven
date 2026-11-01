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

## Connect GitHub

Projects are GitHub repositories. In **Settings > Platform** (as the owner whose email you gave the
installer) press **Create GitHub App**: GitHub asks you to confirm the app's name and permissions
and to install it on your account or organization, and Aven keeps the credentials itself. Nothing
to copy into `.env`.

## Your own domain, with HTTPS

For a server that other machines or people reach, point a DNS name at it, open ports 80 and 443 and
install with the name; Caddy gets and renews the certificate:

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- --domain aven.example.com
```

Runners on other machines then connect over `wss://`, so their tokens never cross the network in the clear.

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
aven install [--domain D] [--port N] [--owner-email E]     server + runner on this machine
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
