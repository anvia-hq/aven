# Aven

**Cloud agents that run on your own machines, with your own API keys.**

Aven is a self-hosted platform for AI coding agents. Describe a task in a thread and an agent works
in a folder on one of your machines, with a terminal and the tools already there, then opens the
pull request as you. The server, the machines the agents run on and the model keys are yours.

- Runs on your laptop, a build machine or a VM, on the machine itself, in the folders you give it. Nothing is isolated, so use machines you own.
- Bring your own OpenAI, Anthropic, Azure OpenAI or OpenAI-compatible key. It stays encrypted on your server.
- One server, any number of machines: add a runner with one command.
- A [boat.dev](https://boat.dev) sandbox is a runtime too. Paste an API key in Settings > Runtimes; it stays encrypted on your server, and the sandbox has to reach that server at a public address.

## Install

macOS or Linux, with nothing installed beforehand (on Windows, use WSL2):

```sh
curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash
```

It installs what is missing (git, and Docker for the server, after asking), the `aven` command, the server and a
runner on this machine, and opens Aven in your browser. Then add a model provider in Settings, connect
GitHub and start a thread. Update later with `aven update`.

## Install with an agent

Paste this to a coding agent (Claude Code, Codex) on the machine you want to set up:

> Install Aven from https://github.com/anvia-hq/aven. **Control plane** (the server, plus a runner on this machine): run `curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash`, answer its prompts (for a server others can reach, add `--domain <host> --owner-email <email>`), then run `aven doctor` and fix anything not `ok`. **Runner only** (another machine that runs the agents): ask me for the server's address and a runner token (Settings > Runtimes > create a runner), then run `curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- --runner --url <address>/api --token <token>` and `aven doctor`. To choose which folders a runner works in, add `--dir <folder>` to the runner command (its home by default). Never print or commit the token, and stop and ask me if git (or Docker, on the server) cannot be installed.

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

## License

Aven is free software under the [MIT License](LICENSE).
