# AGENTS.md

Constraints and working style for AI agents and contributors. How each part works is in `docs/products/0007-system-reference.md`; why it is so is in `docs/decision/`.

## Overview

Bun workspace monorepo (TypeScript, ESM).

```
apps/              control-plane (API), platform (web), runtime (runner), cli (`aven`)
clients/           Native clients (macos, ios: Swift, no TypeScript)
packages/          Shared internal packages: db, agents, protocol, agent-backend, claude, runtime-client, server-kit, github, ui
docs/              Project knowledge (see docs/README.md)
deploy/            Self-hosting: compose file, env template
```

## Commands

Run from the repo root.

```sh
bun install            # install deps for all workspaces
bun run dev            # start every app that defines a `dev` script
bun run typecheck      # tsc across all workspaces; must pass before committing
bun run lint           # oxlint (lint:fix to autofix)
bun run format         # oxfmt (format:check to verify only)
bun test apps packages tooling # unit tests (tooling = our lint rules); the Postgres ones need `createdb aven` and DATABASE_URL
bun run test:e2e       # Playwright. Own ports 8100/5174 and database aven_e2e, a production build of the platform
bun run test:macos     # AvenKit's Swift tests
bun add <pkg> --cwd apps/<name>   # add a dependency to one workspace
```

Ports: control-plane `8000`, platform `5173` (Vite proxies `/api/*` to the backend and strips the prefix, so the frontend calls `/api/threads`, never the backend origin).

## Constraints

- **License: MIT.** Raise it before adding a dependency whose license asks more of Aven than MIT does (a copyleft one).
- **Bun only.** Use `bun`/`bunx`, never npm, yarn or pnpm, and no other lockfiles. Prefer Bun built-ins (`Bun.serve`, `Bun.file`, `bun:test`, `bun:sqlite`).
- **TypeScript strict.** Avoid `any`; where it cannot be avoided, say why in the pull request.
- **No comments in TypeScript.** Names, types and tests say what code does; why goes in `docs/decision/`. Tool directives (`@ts-*`, `oxlint-disable`, `/// <reference>`) stay. `aven/no-comments` in lint enforces it.
- **Types live in `types.ts`.** Every exported `type` or `interface` goes in its module's `types.ts`, imported with `import type`. Component `Props` and zod-inferred types stay beside their code.
- **No barrel files** (an `index.ts` that only re-exports): import from the exact file.
- **Internal packages** are `@aven/<name>`, `"workspace:*"`, shipped as TS source with no build step. Apps never import from another app; shared code goes in `packages/`.
- **Dependencies** go in the workspace that uses them, not the root. Ask before adding a heavy or new one. Patched ones live in `patches/`.
- **Secrets and config.** Never commit secrets or `.env`. Every variable is also listed in `.env.example` with a safe placeholder.
- **Our own lint rules** are in `tooling/oxlint/rules/` (one file and one test each, `aven/<name>` in `.oxlintrc.json`; decisions 0149 and 0281). Beyond no comments, no barrel files and `padded-if`: no `Reflect.get`/`Reflect.apply`, no `.filter().map()` chains (use `flatMap`), no `as unknown as T` in source, no `type X = unknown`, no module mocking, and no copying the accumulator in `reduce`.
- **Tests share the dev database.** A test that reads or changes a shared row (platform settings, the built-in runner) sets it up itself and puts it back (`apps/control-plane/src/testing/kept-platform-settings.ts`). Test support never copies a production class; runner tests use the shipped `DirectorySandbox`.
- **Never edit generated files:** `apps/platform/src/routeTree.gen.ts`, and migrations in `packages/db/drizzle/` (generate them).

## By area

- **apps/platform** (React, Vite, Tailwind 4, Base UI, TanStack Router, jotai): routes stay thin and layer `routes -> module components -> module hooks -> module atoms`; routes and components never import atoms; mutations and their toasts live in hooks. Code goes in `src/modules/<name>/{components,hooks,atoms}` plus `types.ts`; shared primitives in `packages/ui/src/` (`@aven/ui/<name>`, vendored shadcn: re-run the CLI, do not hand-edit; app-specific components stay in `src/components/`). Use Base UI primitives, semantic color tokens (`bg-background`, never raw palette colors) and `@mynaui/icons-react` only. Rules: `docs/rules/0001`, `0003`, `0004`.
- **apps/control-plane** (Elysia, zod): modules in `src/modules/<name>/` with `router.ts`, `schema.ts`, `service.ts`. Routers use method chaining and call services; services own DB access; throw the typed errors of `src/errors.ts`. Scope everything to the session's organization. Rules: `docs/rules/0002`.
- **packages/db** (Drizzle, Postgres): one table per file in `src/schema/`, plural snake_case, uuid `id`, `created_at`/`updated_at`. Change a schema, then `bun run db:generate` from the package. Never call `drizzle-kit` directly.
- **packages/protocol**: the wire shared by the control plane, runners and clients, with no imports but zod (and `@anvia/core` types). Changing the runtime wire changes `WIRE_VERSION` and refuses older runners: prefer an optional field, and see `docs/rules/0005-releasing.md` and `docs/products/0005-runtime-wire-versions.md`. A new run event type must also be added to the control plane's allow-list.
- **packages/agents**: tools live in `src/tools/<name>.ts` (`createTool`, zod input), free of app and HTTP concerns, with `fetch` injectable so tests never hit the network.
- **packages/runtime-client / apps/runtime**: a runner works on its own machine and needs git. Tests use `src/testing/directory-workspaces.ts`. Nothing secret (tokens, variables) is stored in a journal or on disk.
- **apps/cli** (`aven`): changes must keep `aven update` working for installed machines (`docs/rules/0005-releasing.md`). Tests use a throwaway `HOME` and `AVEN_HOME`, never the real ones.
- **clients/macos, clients/ios** (Swift): `AvenKit` has the models and the transcript reducer and is tested against the same fixtures as the TypeScript reducer (`packages/protocol/fixtures/`). Both apps need full Xcode; `docs/products/0004-native-client-contract.md`.
- **apps/macos** (`AvenDesktop`): the native macOS control plane. It mirrors the web app's screens and uses the same API. `AvenDesktopCore` is Foundation-only (`swift test` in `apps/macos`); the SwiftUI app needs macOS 14 and Xcode. It does not replace `clients/macos`. Decision 0297.

## Docs

Before non-trivial work, check `docs/` (format `xxxx-name.md`, numbers per folder, see `docs/README.md`):

- `docs/rules/`: conventions you must follow. These override defaults here.
- `docs/decision/`: past decisions. Do not reverse one silently; write a new one that supersedes it.
- `docs/products/`: what the product does, including the system reference.
- `docs/bugs/`: known **library** bugs and workarounds.

## Working style

- Keep changes small and focused; match the code around them. Read the area's section of the system reference first.
- Make small atomic commits with a short imperative subject. A change that spans layers goes in one pull request, one commit per step.
- Run `bun run typecheck`, `bun run lint`, `bun run format` and the tests for what you changed before every commit. Test against the real thing (a real runner, a real server) when you can, and say what you could not check.
- Record a significant choice as a decision doc in the same pull request. When a change alters how a part works, update its section of `docs/products/0007-system-reference.md`.
- Do not commit, push, merge or release unless asked. Before merging, read every review comment, including the ones a reviewer filtered out.
- Docs and migrations numbered in two open pull requests collide: renumber the second when it merges.
