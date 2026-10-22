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

- Pages are written directly in `src/routes/`. No `pages/` folder.
- Reusable code goes in `src/modules/<module-name>/{components,hooks,atoms}/` plus `types.ts`.
- **No barrel files** (`index.ts` that only re-exports). Import from the exact file.
- Never edit `src/routeTree.gen.ts` (generated).
- Full rules: `docs/rules/0001-platform-structure.md`.

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
