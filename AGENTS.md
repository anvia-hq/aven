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
- Modules: `threads` (API-backed: list, live thread view over SSE, a new thread always starts inside a project; the prompt composer picks provider, model and reasoning effort per message, see `docs/decision/0007-model-and-effort-chosen-per-message.md`), `projects` (API-backed: create, list; threads belong to one), `settings` (including Providers), `navigation`, `auth`, `platform`, `theme`. Shared helpers in `src/lib/` (`format.ts`).
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
- `providers` (per user, not per organization: create, list, update, delete, list models from `<base>/models`, filtered through models.dev to those that can drive the agent, with each model's reasoning levels; never returns keys; see `docs/decision/0006-user-scoped-providers.md`), `projects` (create, list, get; scoped to `session.activeOrganizationId`; a project is a name and a runner, `runtimeId`, and has no path: decision 0010) and `threads` (CRUD, scoped the same way; another organization's project or thread is 404/422) `runtimes` (per organization, shared with every member, only the owner revokes: create returns a token once and stores its hash; list shows `online`; `/runtimes/connect` is the WebSocket a runtime opens with that token; `/runtimes/gateway/*` is the model gateway runs authenticate to with a per-run token; see decision 0008) and `runs` (`RunManager` owns channels, the transcript and event fan-out; the `Runtime` interface in `runs/runtime.ts` is what executes a run, and `RemoteRuntime` is its only implementation: the control plane never runs an agent itself, see decisions 0008 and 0010). A thread always belongs to a project (`project_id`) and copies its `runtime_id` at creation; a project with a null runner (from before sandboxes) cannot start threads. Native clients send `Authorization: Bearer` (Better Auth `bearer`). Runs belong to the server, not to a request: `POST /threads/:id/messages` returns 202 and starts one, `GET /threads/:id/events` is SSE (snapshot, then live events, ping every 5s) and disconnecting never stops the agent, `POST /threads/:id/cancel` stops it. Background shell jobs that finish are steered into the live run, or start a new one. The model comes from the provider the message chose (`providerId`, `modelId`, `reasoningEffort`; it must be the sender's own) or else their default (`providers` module, per user, keys encrypted with `PROVIDER_ENCRYPTION_KEY`); with none, it falls back to `AGENT_PROVIDER` / `AGENT_MODEL` and the env keys. `index.ts` stops all agent jobs on SIGINT/SIGTERM/exit.
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

A runner (the runtime of decision 0008) is a computer or VM running a process that connects out to a control plane (`AVEN_URL`, `AVEN_RUNTIME_TOKEN`, `bun run --cwd apps/runtime start`, or `bun run --cwd apps/runtime build` for a single self-contained binary at `apps/runtime/dist/aven-runtime`; `@valibot/to-json-schema` is marked external because Anvia imports it lazily) and hosts a Docker sandbox per thread (decision 0010). The logic lives in `packages/runtime-client` (`runner.ts`: connection, runs, jobs; `remote-memory.ts`: the conversation is the control plane's). It requires Docker and the image in `apps/runtime/sandbox-image` (`docker build -t aven-sandbox-desktop:dev apps/runtime/sandbox-image`, or set `AVEN_SANDBOX_IMAGE`) and refuses to start without them. Each thread gets a container and an empty workspace directory under `AVEN_RUNTIME_HOME` (default `~/.aven/runtime/workspaces/<thread id>`) mounted at `/workspace`; the file tools work on that directory from the runner, the shell and desktop run in the container (`runtime-client/src/sandbox.ts`; decisions 0009 and 0010). Tests use `runtime-client/src/testing/host-workspaces.ts`, a temp directory with no container; the container tests need Docker and `AVEN_SANDBOX_TEST_IMAGE=aven-sandbox-desktop:dev`. It holds no provider key: model calls go to the control plane's gateway with a per-run token.

## packages/protocol

The wire protocol shared by the control plane, runtimes and every client (see decision 0008): run event types plus the pure `applyEvent` reducer (`events.ts`), and the runtime WebSocket messages (`runtime-wire.ts`). No runtime imports. Non-TypeScript clients follow `docs/products/0004-native-client-contract.md`. Clients (the platform) depend on this, never on `@aven/agents`.

## packages/agents

The agent engine, built on `@anvia/core` (docs index: https://docs.anvia.dev/llms.txt). Source-only, no barrel files; import from `@aven/agents/tools/<name>`.

- Tools live in `src/tools/<name>.ts` and are made with `createTool` (zod input schema). Keep them free of app and HTTP concerns; take config as options with env fallbacks and make `fetch` injectable so tests never hit the network.
- `web_search` (`tools/web-search.ts`) uses Tavily over plain `fetch`; needs `TAVILY_API_KEY`.
- `read`, `write`, `edit` take `{ root }` and refuse paths outside it (symlinks included). `shell`, `shell_output`, `shell_kill` run commands through `JobRegistry` (`jobs/job-registry.ts`): foreground calls wait (2 min default timeout), `background: true` returns a `jobId` at once. Jobs are process groups, so kills reach children. The shell is **not** confined to `root`.
- `projection.ts` turns Anvia stream events and stored messages into the `@aven/protocol` events. Tests that must not hit a provider use `testing/scripted-model.ts`.
- A finished background job is delivered by the host (control-plane `RunManager` does this): `jobs.onComplete` -> `formatJobNotice(job)` -> `stream.steer({ prompt })` while the run is live, or a new run if it ended.
- Memory: `createMemoryStore(db)` (`memory.ts`, `@anvia/memory-drizzle`) persists conversations in Postgres; pass `{ memory }` to `createCodingAgent` and a `session: { sessionId, metadata: { organizationId } }` on every run. Its tables live in `packages/db/src/schema/anvia-memory.ts`.
- `createCodingAgent({ provider: "openai" | "anthropic" | "openai-compatible", root })` (`coding-agent.ts`) assembles model + tools; `model.ts` reads `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`.
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
