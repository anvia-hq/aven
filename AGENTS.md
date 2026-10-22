# AGENTS.md

Guidance for AI agents and contributors working in this repo.

## Overview

Bun workspace monorepo (TypeScript, ESM).

```
apps/              Applications (none yet)
packages/          Shared internal packages (none yet)
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
docker compose up -d   # postgres only (host port 54329, volume pg_data_aven)
docker compose --profile app up -d --build   # + control-plane and platform images
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
- Modules: `threads`, `projects`, `settings`, `activity`, `navigation`, `auth`, `dashboard`, `theme`. Shared helpers in `src/lib/` (`format.ts`).
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
- Full rules: `docs/rules/0002-control-plane-structure.md`.

## packages/db

Drizzle ORM + Postgres (`postgres` driver). Source-only package, no barrel files.

- Import `db` from `@aven/db/client` and tables from `@aven/db/schema/<table>` (e.g. `@aven/db/schema/users`).
- One table per file in `src/schema/`, plural snake_case table names, `id` primary key (uuid; Better Auth tables use text ids), `created_at`/`updated_at` timestamps with time zone.
- Needs `DATABASE_URL` (root `.env`). Run scripts from the package: `bun run db:generate` (writes SQL to `drizzle/`), `db:migrate`, `db:push`, `db:studio`.
- Commit generated migrations in `drizzle/`; never edit them by hand.

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
