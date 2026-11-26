# Built-in preview proxy and hosted-backend parity

Status: accepted. Builds on 0237 (a runner's ports are served on `aven.run` subdomains), 0280 (the Claude backend is its own package), and 0326 (a project's environment is a saved snapshot for 72 hours).

## Context

Running a separate frontend and API repository inside a cloud sandbox (such as a Vite app calling `http://localhost:8010`) repeatedly ran into four harness issues:

1. **Single-port preview friction.** 0237 intentionally isolates each preview port to its own `<port>-<runtimeId>.aven.run` origin and rejects cross-port `Sec-Fetch-Site: same-site` requests until `aven.run` is on the Public Suffix List. Agents were told to write a lightweight local reverse proxy when a repository should not be changed, and repeatedly burned turns hitting workspace write limits, IPv6-only `::1` Vite listeners (`ECONNREFUSED` on `127.0.0.1`), and guessed `*.aven.run` URLs.
2. **Missing `open_browser` on hosted backends.** `createOpenBrowserTool()` was added in `createCodingAgent` (native backend only) and omitted from `backendMcpTools`, so Claude and Codex runs had instructions telling them to call `open_browser` without having the tool.
3. **Unprefixed tool errors on Claude runs.** The Claude Agent SDK exposes Aven tools as `mcp__aven__<name>` and defers MCP tool loading behind tool search by default. On resumed turns, Claude occasionally emitted bare names like `exec_command` from the prompt and failed with `No such tool available: exec_command`.
4. **Missing `AVEN_CLOUD=1` in interactive sandbox shells.** `runEnvironmentSetup` and `runEnvironmentResume` passed `AVEN_CLOUD=1`, but ordinary `exec_command` calls did not. When a 72-hour saved snapshot expired and an agent ran `bash .aven/setup`, the script took its local-machine branch instead of provisioning cloud services.

## Decision

- **Ship `aven proxy` in the CLI.** `aven proxy --port <port> --web <webPort> [--api <apiPort>] [--route /prefix=<port>,...] [--origin <url>]` runs a local HTTP + WebSocket reverse proxy on `127.0.0.1:<port>` that tries both `127.0.0.1` and `[::1]` upstreams, routes explicit prefixes and non-Vite `Sec-Fetch-Dest: empty` requests to `--api`, rewrites `Host` and API `Origin` to `localhost`, and preserves multiple `Set-Cookie` headers and HMR WebSockets. 0237's preview isolation and `Sec-Fetch-Site: same-site` guard remain untouched.
- **Expose `open_browser` in `backendMcpTools` and `callAvenToolResult`** whenever `host.questions !== false`, matching `createCodingAgent`.
- **Configure Claude's SDK MCP server with `alwaysLoad: true` and `toolAliases`** mapping each bare Aven tool name (`exec_command`, `open_browser`, …) to `mcp__aven__<name>`.
- **Inject `AVEN_CLOUD=1` into `sandbox.setProjectEnv` during `prepareRun`** whenever `sandboxProvider(thread)` is defined (cloud sandboxes only, never manual runners), and remind cloud agents in `<machine>` to prefer `save_environment` or `bash .aven/setup` when environment tools are missing.

## Consequences

- Agents running multi-port apps in Aven Cloud can front web + API with one background `aven proxy` command instead of writing ad-hoc proxy scripts.
- Claude and Codex threads can offer the Browser panel with `open_browser` identically to native threads, and Claude runs no longer fail on bare tool names or deferred MCP startup.
- Cloud sandbox shells consistently see `AVEN_CLOUD=1` whether `.aven/setup` is run via `save_environment`, `.aven/resume`, or `exec_command`.
