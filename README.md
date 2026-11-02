# Aven

**Cloud agents that run on your own machines, with your own API keys.**

Aven is a self-hosted platform for AI coding agents. Describe a task in a thread and an agent works
on your GitHub repository in a sandbox of its own, with a desktop, a browser and a terminal, then
opens the pull request as you. The server, the machines the agents run on and the model keys are
yours.

- Runs on your laptop, a build machine or a VM, in Docker sandboxes, one per thread.
- Bring your own OpenAI, Anthropic, Azure OpenAI or OpenAI-compatible key. It stays encrypted on your server.
- One server, any number of machines: add a runner with one command.

## Install

macOS or Linux, with nothing installed beforehand (on Windows, use WSL2):

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash
```

It installs what is missing (git and Docker, after asking), the `aven` command, the server and a
runner on this machine, and opens Aven in your browser. Then add a model provider in Settings, connect
GitHub and start a thread. Update later with `aven update`.

## Docs

- [Self-hosting](docs/guides/self-hosting.md): how it works, your own domain, more runners, updating, backup
- [Cloud](docs/guides/cloud.md): a server others can reach, HTTPS, who can connect
- [Connect GitHub](docs/guides/connect-github.md)
- [Troubleshooting](docs/guides/troubleshooting.md)
- [The `aven` command](docs/guides/cli.md)

## Development

Bun workspace monorepo; read [AGENTS.md](AGENTS.md) first, and `docs/` for rules and decisions.

```sh
bun install
createdb aven
cp .env.example .env     # then fill it in, with AVEN_RUNTIME_HOME=<this checkout>/.aven/runtime
bun run dev
```

How installs and releases work: [docs/decision/0073](docs/decision/0073-install-and-update-with-a-script.md),
[0074](docs/decision/0074-the-github-app-is-created-from-the-platform.md) and
[docs/rules/0005-releasing.md](docs/rules/0005-releasing.md).
