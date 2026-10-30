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
- Modules: `threads` (API-backed: list, live thread view over SSE, a new thread always starts inside a project; the prompt composer picks provider, model and reasoning effort per message, see `docs/decision/0007-model-and-effort-chosen-per-message.md`, and each thread remembers its own choice in localStorage while a new thread starts from the last one picked (decision 0029); when the agent asks a question the composer gives way to a one-question-per-screen form, decision 0020; an image the agent showed with `show_image` stands on its own in the conversation, loaded from `/api/threads/:id/artifacts/:name`, decision 0033; the composer attaches files from its button, by paste or by drop, and sends them in base64 with the message, `hooks/use-attachments.ts`, decision 0034; the composer is `@anvia/react-ui`'s tiptap `ComposerPrimitive`, where `@` mentions a file of the workspace and `/` a skill, sent as `mentions` and drawn as chips, `hooks/use-mentions.ts`, `components/mention-chip.tsx`, decision 0036; the header's Ship button ships the thread as a pull request as the person, then links to it and ships again as an update, off while the agent works, and offers Connect GitHub to ship when their account is not connected, `components/ship-button.tsx`, `hooks/use-ship-thread.ts`, `projects/hooks/use-github-account.ts`, decisions 0040 and 0041), `projects` (API-backed: import a GitHub repository, list; there is no "New project"; threads belong to one, see `docs/decision/0013-projects-are-github-repositories.md`), `desktop` (the Desktop panel beside a thread: a live noVNC view of the sandbox's desktop, watch-only until Take over, and a sandbox that is off has a Wake up button; `@novnc/novnc` has no types, see `modules/desktop/novnc.d.ts`; decisions 0015 and 0039), `files` (the Files panel: a read-only tree of the thread's workspace and files in tabs; what is open is kept per thread in localStorage; decision 0031; text is coloured with `shiki`, fetched when a file opens: decision 0032), `diff` (the Changes panel beside a thread, opened next to Desktop: Last turn or Full diff, unified or split, parsed from a patch the runner makes with `git diff`; decision 0030), `overview` (the column beside a thread's conversation: Environment, Context and Usage cards; Usage is the thread's tokens over all model calls, Context is the window the latest request filled), `settings` (including Providers, and Skills: upload a skill as a folder or a `.zip`, unpacked in the browser with `fflate`, switch one off, see the built-in ones; decision 0035), `navigation` (including the draggable sidebar edge, whose width is kept in localStorage), `auth`, `platform`, `theme`. Shared helpers in `src/lib/` (`format.ts`).
- Assistant text is drawn by `components/markdown.tsx` with Anvia's `StreamMarkdown` (`@anvia/react-ui/stream`): finished blocks are memoized and the newest text fades in while `live` (decision 0027), and a streaming message's parts are first paced out by `modules/threads/hooks/use-smooth-parts.ts` (`useSmoothStreamItems` from `@anvia/react`) so bursty providers such as Azure read as a steady flow; the thread follows content growth with a `ResizeObserver`, not message changes (decision 0028). Do not go back to one `react-markdown` over the whole message: it re-parses on every delta and the stream shows in chunks.
- Shared UI primitives live in `src/components/`, not in a module. The full shadcn/ui set (Base UI variant) is installed there; add more with `bunx shadcn@latest add <name> --cwd apps/platform`.
- Reusable feature code goes in `src/modules/<module-name>/{components,hooks,atoms}/` plus `types.ts`.
- **No barrel files** (`index.ts` that only re-exports). Import from the exact file.
- UI primitives (button, input, form, ...) use **Base UI** through `src/components/`, never native elements (lint-enforced). See `docs/rules/0003-ui-primitives-base-ui.md`.
- Colors use semantic tokens from `src/index.css` (`bg-background`, `text-muted-foreground`, `bg-primary`, ...), never raw palette colors. See `docs/rules/0004-color-tokens.md`.
- Icons: `@mynaui/icons-react` only (no lucide). After `shadcn add`, convert any `lucide-react` imports; mapping in `docs/rules/0003-ui-primitives-base-ui.md`.
- Layout state (sidebar width, thread panel sizes, whether the overview and desktop are open) is kept in localStorage through `src/hooks/use-local-storage.ts`; decision 0017.
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
- `providers` (kinds `openai`, `anthropic`, `azure` and `openai-compatible`; Azure takes a resource URL, a key and a deployment name, decisions 0019 and 0025, and lists the resource's deployments (`/openai/deployments`); per user, not per organization: create, list, update, delete, list models from `<base>/models`, filtered through models.dev to those that can drive the agent, with each model's reasoning levels; never returns keys; see `docs/decision/0006-user-scoped-providers.md`), `github` (an organization connects a GitHub App installation: `GET /github` gives the install URL, `/github/callback` is the app's Callback URL and checks the signed `state` and the user's own access, `/github/installations[/:id/repos]`; mints read-only installation tokens, decision 0013) and `projects` (import a repository, list, get; scoped to `session.activeOrganizationId`; a project is a repository of an installation and a runner, `runtimeId`, and has no path: decisions 0010 and 0013) and `threads` (CRUD, scoped the same way; another organization's project or thread is 404/422) `runtimes` (per organization, shared with every member, only the owner revokes: create returns a token once and stores its hash; list shows `online`; `/runtimes/connect` is the WebSocket a runtime opens with that token; `/runtimes/gateway/*` is the model gateway runs authenticate to with a per-run token; see decision 0008) and `files` (`GET /threads/:id/files` and `.../files/content`: read-only, through the runner, decision 0031; `.../files/search?q=` finds files for the composer's `@`, decision 0036) and `ship` (`POST /threads/:id/ship`: as the person, with their own GitHub user token (`github/user-tokens.ts`, kept encrypted per user, renewed when used; decision 0041), has the thread's runner commit and push its branch `aven/<id8>` (`repo.push`, the token handed over for that one call, commits by their GitHub noreply identity), opens a draft pull request with the same token, and keeps `pull_request_number`/`pull_request_url` on the thread; refuses while a run is live, with nothing to ship, when the person has not connected GitHub (`GET /github/user`, `GET /github/connect?next=` and the app's callback keep the token), when the app has not been approved for `contents` and `pull_requests` write, or when the person cannot push to the repository; the title and description are drafted by the shipper's own model, never failing the ship; decision 0040) and `diff` (`GET /threads/:id/diff?scope=turn|all`: asks the runner for a thread's changes as a unified patch, decision 0030) and `artifacts` (`GET /threads/:id/artifacts/:name`: the bytes of an image the agent showed with `show_image`, read through the runner that keeps it; decision 0033) and `desktop` (a thread's desktop: `GET /threads/:id/desktop`, `POST .../takeover` and `.../release`, `POST .../wake` which has the runner start the thread's sandbox without a run (decision 0039), and the `.../stream` WebSocket that relays the runner's VNC stream to the browser; decision 0015) and `skills` (a user's skills, like providers per user: `GET/POST /skills`, `GET /skills/built-in`, `PATCH/DELETE /skills/:id`; an upload is validated with Anvia's `skill.local` and kept as a `.tar.gz` named by its digest; the built-in ones are the folders in `apps/control-plane/skills/`; a run carries the sender's enabled skills and the built-ins, and the runner fetches an archive with `skills.get`; decision 0035) and `runs` (`RunManager` owns channels, the transcript and event fan-out; the `Runtime` interface in `runs/runtime.ts` is what executes a run, and `RemoteRuntime` is its only implementation; the control plane runs agents only through a runner, including its own built-in one in `runtimes/local.ts` (`AVEN_LOCAL_RUNNER`, row `00000000-0000-4000-8000-000000000001`), see decisions 0008 and 0010). A thread always belongs to a project (`project_id`) and copies its `runtime_id` at creation; both columns are `NOT NULL` (decision 0011). Native clients send `Authorization: Bearer` (Better Auth `bearer`). Runs belong to the server, not to a request: `POST /threads/:id/messages` returns 202 and starts one (it may carry `attachments` in base64: every file goes to the sandbox's `/uploads`, an image also to the model; `threads/attachments.ts`, decision 0034; and `mentions`, the files and skills its `@` and `/` tokens name, checked against the prompt in `threads/schema.ts`, decision 0036), `GET /threads/:id/events` is SSE (snapshot, then live events, ping every 5s) and disconnecting never stops the agent, `POST /threads/:id/cancel` stops it. `POST /threads/:id/answer` answers the agent's question and resumes the run (the continuation is kept in `threads.pending_continuation` and never sent to clients; messages are 409 meanwhile; decision 0020). Nothing is steered into a run and a finished process does not restart one (decision 0012): `POST /threads/:id/cancel` stops the run and leaves what the agent started in its sandbox alone. The model comes from the provider the message chose (`providerId`, `modelId`, `reasoningEffort`; it must be the sender's own) or else their default (`providers` module, per user, keys encrypted with `PROVIDER_ENCRYPTION_KEY`); with none, it falls back to `AGENT_PROVIDER` / `AGENT_MODEL` and the env keys. `index.ts` stops the built-in runner (removing its containers) and all runs on SIGINT/SIGTERM.
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

A runner (the runtime of decision 0008) needs `git` besides Docker and is a computer or VM running a process that connects out to a control plane (`AVEN_URL`, `AVEN_RUNTIME_TOKEN`, `bun run --cwd apps/runtime start`, or `bun run --cwd apps/runtime build` for a single self-contained binary at `apps/runtime/dist/aven-runtime`; `@valibot/to-json-schema` is marked external because Anvia imports it lazily) and hosts a Docker sandbox per thread (decision 0010). The logic lives in `packages/runtime-client` (`runner.ts`: connection, runs, idle release; `thread-tools.ts`: the agent's tools; `durable-runs.ts` and `durable-events.ts`: every run goes through `@anvia/durable`, journaled in SQLite at `<AVEN_RUNTIME_HOME>/runs.db` (`journalPath`), which holds the model's history, while the transcript is sent home with `memory.append`; a question parks the run in the journal and `late-bound-tools.ts` keeps its tools pointed at the thread's current sandbox; decision 0021; `define_goal` hands a large task to a durable goal that the runner works in unattended sessions, checking `verifyCommands` in the sandbox after each, before the agent reports in the thread: `goal-assessment.ts`, `goal-report.ts`, `durable-runs.ts`, decision 0022). It requires Docker and the image in `apps/runtime/sandbox-image` (an Xfce desktop with Chrome on amd64, Chromium on arm64: decisions 0014 and 0038; it also carries Node 24, Bun, Go, Rust, Python 3.13 with document and data libraries in `/opt/venv`, and no LibreOffice, and containers get 4 CPUs, 8 GB and 1024 processes unless `AVEN_SANDBOX_CPUS`, `AVEN_SANDBOX_MEMORY_MB` and `AVEN_SANDBOX_PIDS_LIMIT` say otherwise: decision 0037; `AVEN_SANDBOX_PLATFORM=linux/amd64` runs the amd64 build on an arm64 host; `AVEN_SANDBOX_RUNTIME=runsc` runs containers under gVisor on a Linux runner: decision 0016) (`docker build -t aven-sandbox-desktop:dev apps/runtime/sandbox-image`, or set `AVEN_SANDBOX_IMAGE`) and `git`, and refuses to start without them. Each thread gets a container and a workspace directory under `AVEN_RUNTIME_HOME` that holds a clone of the project's repository, made on first use with a short-lived read-only token from the control plane (`repo.access` on the runtime wire, `git-clone.ts`; decision 0013), and commits and pushes the thread's branch on the control plane's `repo.push` call (`publish-branch.ts`: hooks, fsmonitor and credential helpers off, never forced, the token only in git's environment; decision 0040), on branch `aven/<thread id prefix>` (default `~/.aven/runtime/workspaces/<thread id>`), mounted at `/workspace`; every tool the agent has (files, commands, processes, desktop, all from `@anvia/sandbox`, plus our `edit`) acts inside the container (`runtime-client/src/sandbox.ts`, `thread-tools.ts`; decisions 0009, 0010 and 0012). A thread's container is freed after `idleReleaseMs` (15 minutes) with no run and no running process. Tests use `runtime-client/src/testing/directory-workspaces.ts`, a `SandboxRuntime` over a temp directory with no container; the container tests need Docker and `AVEN_SANDBOX_TEST_IMAGE=aven-sandbox-desktop:dev`. It writes the files users attach to `<AVEN_RUNTIME_HOME>/uploads/<thread id>/`, which the thread's container mounts read-only at `/uploads`, and puts attached images in the prompt (`uploads.ts`, `attachments.ts`, decision 0034). It keeps the images the agent shows with `show_image` in `<AVEN_RUNTIME_HOME>/artifacts/<thread id>/`, outside the container, so they load after the sandbox is released, and answers `artifacts.read` (`artifacts.ts`, decision 0033). It answers `files.list` and `files.read` (`workspace-files.ts`, confined by real path: decision 0031) and `files.search` (the paths `git ls-files` knows that match, for the composer's `@`: decision 0036) and `diff.get` with a thread's changes (`thread-diff.ts`: a ref `refs/aven/turn` marks the working tree when a run starts; decision 0030). It puts a run's skills in `<AVEN_RUNTIME_HOME>/skills/threads/<thread id>/`, mounted read-only at `/skills`, from archives it caches by digest, and lists them with the repository's own in `/workspace/.aven/skills`, which win on a name (`skills.ts`, decision 0035). It also streams a thread's desktop to viewers (`desktop-viewers.ts`: binary frames carrying a viewer id, answering `desktop.status`/`takeover`/`release`; decision 0015) and starts a thread's sandbox on `desktop.wake` (`runner.ts`, decision 0039). It holds no provider key: model calls go to the control plane's gateway with a per-run token.

## packages/protocol

The wire protocol shared by the control plane, runtimes and every client (see decision 0008): run event types plus the pure `applyEvent` reducer (`events.ts`), and the runtime WebSocket messages (`runtime-wire.ts`). No runtime imports. Non-TypeScript clients follow `docs/products/0004-native-client-contract.md`. Clients (the platform) depend on this, never on `@aven/agents`.

## packages/agents

The agent engine, built on `@anvia/core` (docs index: https://docs.anvia.dev/llms.txt). Source-only, no barrel files; import from `@aven/agents/tools/<name>`.

- Tools live in `src/tools/<name>.ts` and are made with `createTool` (zod input schema). Keep them free of app and HTTP concerns; take config as options with env fallbacks and make `fetch` injectable so tests never hit the network.
- `web_search` (`tools/web-search.ts`) uses Tavily over plain `fetch`; needs `TAVILY_API_KEY`.
- The agent's tools are the sandbox's (decision 0012): `exec_command`, `read_file`, `write_file`, `list_files`, `list_ports`, `start_process`, `list_processes`, `read_process_logs`, `stop_process`, `wait_for_port` and the desktop tools, made by `createSandboxTools` in `runtime-client/src/thread-tools.ts`. `edit` (`tools/edit.ts`) and `show_image` (`tools/show-image.ts`, decision 0033: PNG/JPEG/GIF/WebP by their bytes, a copy kept by the runner) are ours, over any `{ workdir, readTextFile, writeTextFile }`. `createCodingAgent` takes them as `tools`; it does not build file or shell tools.
- `skills.ts` reads skill folders with Anvia's loader (a broken one is left out, not fatal) and words the skill list in the agent's instructions; the agent is not given Anvia's skill tools, which run on the host, and reads a skill with `read_file` and runs its scripts with `exec_command` (decision 0035).
- `attachments.ts` builds the prompt of a message with files or mentions (`sentPrompt`: the user's text, a note on the files and skills it mentions from `mentions.ts`, a note on where the files are in `/uploads`, the images) and reads it back for the transcript from the message's metadata (decisions 0034 and 0036).
- `projection.ts` turns Anvia stream events and stored messages into the `@aven/protocol` events, including a `usage` event per model call (tokens, and the context window when the model's is known: from the SDK, else from models.dev through the control plane). A runner's events are checked against an allow-list in the control plane (`runtimes/wire.ts`), so a new event type must be added there too. Tests that must not hit a provider use `testing/scripted-model.ts`.
- Azure deployments of non-OpenAI models run on chat completions, whose stream goes through `null-free-stream.ts` (decision 0026, bug 0002).
- Compaction: history past 70% of the model's `contextWindow` is summarized by the run's own model (`compactionFor` in `coding-agent.ts`); `createCodingAgent` returns it for the runner to register with durable (a memory store, if one is given, uses it too). Without a known context window, history is kept whole.
- Nothing tells the agent a process ended; its instructions say to look with `read_process_logs`, `list_processes` and `wait_for_port`.
- Memory: `createMemoryStore(db)` (`memory.ts`, `@anvia/memory-drizzle`) persists conversations in Postgres (an Anthropic run starts from that history without its thinking blocks, which the API rejects across runs: `docs/bugs/0001-anthropic-thinking-signature-across-runs.md`); pass `{ memory }` to `createCodingAgent` and a `session: { sessionId, metadata: { organizationId } }` on every run. Its tables live in `packages/db/src/schema/anvia-memory.ts`.
- `createCodingAgent({ provider: "openai" | "anthropic" | "azure" | "openai-compatible", tools })` (`coding-agent.ts`) assembles model + tools, including `ask_user` (the agent asks the user: the run ends as `interaction`, the control plane keeps the continuation in `threads.pending_continuation`, and `POST /threads/:id/answer` resumes it with `run.resume`; decision 0020); `model.ts` reads `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`.
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
