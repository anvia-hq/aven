# AGENTS.md

Guidance for AI agents and contributors working in this repo.

## Overview

Bun workspace monorepo (TypeScript, ESM).

```
apps/              Applications (control-plane, platform, runtime)
clients/           Native clients (macos: SwiftPM, no TypeScript)
packages/          Shared internal packages (db, agents, protocol)
docs/              Project knowledge (see docs/README.md)
```

## Commands

Run from the repo root.

```sh
bun install            # install deps for all workspaces
bun run dev            # start every app that defines a `dev` script
bun run typecheck      # tsc across all workspaces; must pass before committing
bun run lint           # oxlint (lint:fix to autofix)
bun run format         # oxfmt (format:check to verify only)
createdb aven          # one-time: uses your local Postgres (localhost:5432)
bun run test:e2e       # Playwright (root). Own ports 8100/5174 and database aven_e2e
bun add <pkg> --cwd apps/<name>   # add a dependency to one workspace
```

## Constraints

- **Bun only.** Use `bun`/`bunx`. Do not use npm, yarn, or pnpm, and do not commit other lockfiles.
- **Prefer Bun built-ins** (`Bun.serve`, `Bun.file`, `bun:test`, `bun:sqlite`) over third-party equivalents.
- **TypeScript strict.** No `any` without a comment explaining why. Extend the root `tsconfig.json`.
- **Internal packages** are named `@aven/<name>`, referenced as `"workspace:*"`, and exported from `src/index.ts`. Apps never import from another app. Shared code goes in `packages/`.
- **No build step** for internal packages; they ship as TS source.
- **Dependencies:** add them to the workspace that uses them, not the root (root is for tooling only). Ask before adding a heavy or new dependency.
- Never commit secrets or `.env` files. Config goes in `.env` (gitignored, loaded automatically by Bun); every variable must also be listed in `.env.example` with a safe placeholder.

## apps/platform

React + Vite + Tailwind 4 + Base UI (headless) + TanStack Router (file-based) + jotai.

- Pages are written directly in `src/routes/` and stay thin. Layering is `routes -> module components -> module hooks -> module atoms`; routes and components never import atoms (use the module's hook). Mutations and their toasts live in hooks.
- Imports: relative inside a module, the `@/` alias everywhere else (`@/components/*`, `@/lib/*`, `@/modules/*`). Details in `docs/rules/0001-platform-structure.md`.
- Modules: `threads` (API-backed: list, live thread view over SSE, a new thread always starts inside a project; the prompt composer picks provider, model and reasoning effort per message, see `docs/decision/0007-model-and-effort-chosen-per-message.md`), `projects` (API-backed: import a GitHub repository, list; there is no "New project"; threads belong to one, see `docs/decision/0013-projects-are-github-repositories.md`), `desktop` (the Desktop panel beside a thread: a live noVNC view of the sandbox's desktop, watch-only until Take over; `@novnc/novnc` has no types, see `modules/desktop/novnc.d.ts`; decision 0015), `settings` (including Providers), `navigation`, `auth`, `platform`, `theme`. Shared helpers in `src/lib/` (`format.ts`).
- Shared UI primitives live in `src/components/`, not in a module. The full shadcn/ui set (Base UI variant) is installed there; add more with `bunx shadcn@latest add <name> --cwd apps/platform`.
- Reusable feature code goes in `src/modules/<module-name>/{components,hooks,atoms}/` plus `types.ts`.
- **No barrel files** (`index.ts` that only re-exports). Import from the exact file.
- UI primitives (button, input, form, ...) use **Base UI** through `src/components/`, never native elements (lint-enforced). See `docs/rules/0003-ui-primitives-base-ui.md`.
- Colors use semantic tokens from `src/index.css` (`bg-background`, `text-muted-foreground`, `bg-primary`, ...), never raw palette colors. See `docs/rules/0004-color-tokens.md`.
- Icons: `@mynaui/icons-react` only (no lucide). After `shadcn add`, convert any `lucide-react` imports; mapping in `docs/rules/0003-ui-primitives-base-ui.md`.
- Dark mode is the default; theme state lives in `src/modules/theme` (`useTheme`, `ThemeSelector`).
- `src/components/` (vendored shadcn) is excluded from lint and formatting rules do not apply to hand edits there; prefer re-running the shadcn CLI over editing.
- Non-feature singletons (auth client, api fetch helper) go in `src/lib/`.
- Never edit `src/routeTree.gen.ts` (generated).
- Full rules: `docs/rules/0001-platform-structure.md`.

## Ports

- control-plane (backend): `8000` (`PORT` in `.env`).
- platform (frontend): `5173`. Vite proxies `/api/*` to `http://localhost:8000` and strips the `/api` prefix, so the frontend calls `/api/users`, never the backend origin directly.

## apps/control-plane

Elysia (Bun) + zod, uses `@aven/db`.

- Modules in `src/modules/<module-name>/` with `router.ts`, `schema.ts` (zod) and `service.ts`.
- Routers use method chaining: `new Elysia({ prefix }).get().post().patch()`.
- Routers call services, services own DB access. Mount routers in `src/index.ts`.
- Auth is Better Auth (`modules/auth`); protect routes with `.use(authRouter)` + `{ auth: true }`.
- `providers` (per user, not per organization: create, list, update, delete, list models from `<base>/models`, filtered through models.dev to those that can drive the agent, with each model's reasoning levels; never returns keys; see `docs/decision/0006-user-scoped-providers.md`), `github` (an organization connects a GitHub App installation: `GET /github` gives the install URL, `/github/callback` is the app's Callback URL and checks the signed `state` and the user's own access, `/github/installations[/:id/repos]`; mints read-only installation tokens, decision 0013) and `projects` (import a repository, list, get; scoped to `session.activeOrganizationId`; a project is a repository of an installation and a runner, `runtimeId`, and has no path: decisions 0010 and 0013) and `threads` (CRUD, scoped the same way; another organization's project or thread is 404/422) `runtimes` (per organization, shared with every member, only the owner revokes: create returns a token once and stores its hash; list shows `online`; `/runtimes/connect` is the WebSocket a runtime opens with that token; `/runtimes/gateway/*` is the model gateway runs authenticate to with a per-run token; see decision 0008) and `desktop` (a thread's desktop: `GET /threads/:id/desktop`, `POST .../takeover` and `.../release`, and the `.../stream` WebSocket that relays the runner's VNC stream to the browser; decision 0015) and `runs` (`RunManager` owns channels, the transcript and event fan-out; the `Runtime` interface in `runs/runtime.ts` is what executes a run, and `RemoteRuntime` is its only implementation; the control plane runs agents only through a runner, including its own built-in one in `runtimes/local.ts` (`AVEN_LOCAL_RUNNER`, row `00000000-0000-4000-8000-000000000001`), see decisions 0008 and 0010). A thread always belongs to a project (`project_id`) and copies its `runtime_id` at creation; both columns are `NOT NULL` (decision 0011). Native clients send `Authorization: Bearer` (Better Auth `bearer`). Runs belong to the server, not to a request: `POST /threads/:id/messages` returns 202 and starts one, `GET /threads/:id/events` is SSE (snapshot, then live events, ping every 5s) and disconnecting never stops the agent, `POST /threads/:id/cancel` stops it. Nothing is steered into a run and a finished process does not restart one (decision 0012): `POST /threads/:id/cancel` stops the run and leaves what the agent started in its sandbox alone. The model comes from the provider the message chose (`providerId`, `modelId`, `reasoningEffort`; it must be the sender's own) or else their default (`providers` module, per user, keys encrypted with `PROVIDER_ENCRYPTION_KEY`); with none, it falls back to `AGENT_PROVIDER` / `AGENT_MODEL` and the env keys. `index.ts` stops the built-in runner (removing its containers) and all runs on SIGINT/SIGTERM.
- Full rules: `docs/rules/0002-control-plane-structure.md`.

## packages/db

Drizzle ORM + Postgres (`postgres` driver). Source-only package, no barrel files.

- Import `db` from `@aven/db/client` and tables from `@aven/db/schema/<table>` (e.g. `@aven/db/schema/users`).
- One table per file in `src/schema/`, plural snake_case table names, `id` primary key (uuid; Better Auth tables use text ids), `created_at`/`updated_at` timestamps with time zone.
- Needs `DATABASE_URL` (root `.env`). Run scripts from the package: `bun run db:generate` (writes SQL to `drizzle/`), `db:migrate`, `db:push`, `db:studio`.
- Commit generated migrations in `drizzle/`; never edit them by hand. drizzle-kit runs on the Bun runtime (`bun --bun` in the `db:*` scripts) because it loads schema files with `require` and `@anvia/memory-drizzle` is ESM-only (`import` condition only), which fails under Node with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Don't call `drizzle-kit` directly.

## clients/macos

The native macOS client (Swift, no web view; decision 0008). Two SwiftPM packages: `AvenKit` (Foundation only: wire models, the `Transcript` reducer, SSE parsing, the bearer-token `APIClient`, a Keychain `TokenStore`) and `AvenMac` (the SwiftUI app on top of it). Contract: `docs/products/0004-native-client-contract.md`.

- `bun run test:macos` runs AvenKit's tests with just the Swift toolchain. They include `packages/protocol/fixtures/reducer.json`, the same fixtures the TypeScript reducer is tested with, so the two reducers cannot drift. Set `AVEN_TEST_URL=http://localhost:8000` to also run the live-server test (it signs up a throwaway user).
- If SwiftPM says `plugin for module 'TestingMacros' not found`, a stale build service is running: `pkill -f SWBBuildService; pkill -f swift-build`, then `rm -rf .build` and retry.
- `AvenMac` needs full Xcode (SwiftUI's macros are not in the Command Line Tools); it has only been written, not compiled, on a machine without Xcode. Build it with `xcodebuild` or open the folder in Xcode.
- Use `URLSession` without cookies for the API (`APIClient.cookielessSession()`), and never `bytes.lines` for SSE: it drops the empty lines that end a message (`LineSplitter` exists for that).

## apps/runtime and packages/runtime-client

A runner (the runtime of decision 0008) needs `git` besides Docker and is a computer or VM running a process that connects out to a control plane (`AVEN_URL`, `AVEN_RUNTIME_TOKEN`, `bun run --cwd apps/runtime start`, or `bun run --cwd apps/runtime build` for a single self-contained binary at `apps/runtime/dist/aven-runtime`; `@valibot/to-json-schema` is marked external because Anvia imports it lazily) and hosts a Docker sandbox per thread (decision 0010). The logic lives in `packages/runtime-client` (`runner.ts`: connection, runs, idle release; `thread-tools.ts`: the agent's tools; `remote-memory.ts`: the conversation is the control plane's). It requires Docker and the image in `apps/runtime/sandbox-image` (a KDE Plasma desktop with Chrome on amd64, Chromium on arm64: decision 0014; `AVEN_SANDBOX_PLATFORM=linux/amd64` runs the amd64 build on an arm64 host) (`docker build -t aven-sandbox-desktop:dev apps/runtime/sandbox-image`, or set `AVEN_SANDBOX_IMAGE`) and `git`, and refuses to start without them. Each thread gets a container and a workspace directory under `AVEN_RUNTIME_HOME` that holds a clone of the project's repository, made on first use with a short-lived read-only token from the control plane (`repo.access` on the runtime wire, `git-clone.ts`; decision 0013), on branch `aven/<thread id prefix>` (default `~/.aven/runtime/workspaces/<thread id>`), mounted at `/workspace`; every tool the agent has (files, commands, processes, desktop, all from `@anvia/sandbox`, plus our `edit`) acts inside the container (`runtime-client/src/sandbox.ts`, `thread-tools.ts`; decisions 0009, 0010 and 0012). A thread's container is freed after `idleReleaseMs` (15 minutes) with no run and no running process. Tests use `runtime-client/src/testing/directory-workspaces.ts`, a `SandboxRuntime` over a temp directory with no container; the container tests need Docker and `AVEN_SANDBOX_TEST_IMAGE=aven-sandbox-desktop:dev`. It also streams a thread's desktop to viewers (`desktop-viewers.ts`: binary frames carrying a viewer id, answering `desktop.status`/`takeover`/`release`; decision 0015). It holds no provider key: model calls go to the control plane's gateway with a per-run token.

## packages/protocol

The wire protocol shared by the control plane, runtimes and every client (see decision 0008): run event types plus the pure `applyEvent` reducer (`events.ts`), and the runtime WebSocket messages (`runtime-wire.ts`). No runtime imports. Non-TypeScript clients follow `docs/products/0004-native-client-contract.md`. Clients (the platform) depend on this, never on `@aven/agents`.

## packages/agents

The agent engine, built on `@anvia/core` (docs index: https://docs.anvia.dev/llms.txt). Source-only, no barrel files; import from `@aven/agents/tools/<name>`.

- Tools live in `src/tools/<name>.ts` and are made with `createTool` (zod input schema). Keep them free of app and HTTP concerns; take config as options with env fallbacks and make `fetch` injectable so tests never hit the network.
- `web_search` (`tools/web-search.ts`) uses Tavily over plain `fetch`; needs `TAVILY_API_KEY`.
- The agent's tools are the sandbox's (decision 0012): `exec_command`, `read_file`, `write_file`, `list_files`, `list_ports`, `start_process`, `list_processes`, `read_process_logs`, `stop_process`, `wait_for_port` and the desktop tools, made by `createSandboxTools` in `runtime-client/src/thread-tools.ts`. `edit` (`tools/edit.ts`) is ours, over any `{ workdir, readTextFile, writeTextFile }`. `createCodingAgent` takes them as `tools`; it does not build file or shell tools.
- `projection.ts` turns Anvia stream events and stored messages into the `@aven/protocol` events. Tests that must not hit a provider use `testing/scripted-model.ts`.
- Nothing tells the agent a process ended; its instructions say to look with `read_process_logs`, `list_processes` and `wait_for_port`.
- Memory: `createMemoryStore(db)` (`memory.ts`, `@anvia/memory-drizzle`) persists conversations in Postgres; pass `{ memory }` to `createCodingAgent` and a `session: { sessionId, metadata: { organizationId } }` on every run. Its tables live in `packages/db/src/schema/anvia-memory.ts`.
- `createCodingAgent({ provider: "openai" | "anthropic" | "openai-compatible", tools })` (`coding-agent.ts`) assembles model + tools; `model.ts` reads `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`.
- Tests are `bun:test` next to the code (`bun test packages/agents`).

## Docs

Before non-trivial work, check `docs/`:

- `docs/rules/`: conventions you must follow. These override defaults here.
- `docs/decision/`: past decisions. Do not reverse one silently; write a new one that supersedes it.
- `docs/products/`: what the product should do.
- `docs/bugs/`: known **library** bugs and workarounds. If you hit one, add a doc here.

File format is `xxxx-name.md` (e.g. `0001-use-bun-workspaces.md`). Details in `docs/README.md`.

## Working style

- Keep changes small and focused; match surrounding code style.
- Run `bun run typecheck`, `bun run lint` and `bun run format` after changes.
- Record significant choices as a decision doc.
- Commit messages: short imperative subject line.
