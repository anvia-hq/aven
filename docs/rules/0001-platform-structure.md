# Platform structure

Status: accepted

Applies to `apps/platform` (React, Vite, TanStack Router, Base UI, jotai, Tailwind 4).

## Modules

Feature code lives in `src/modules/<module-name>/` (kebab-case):

```
src/modules/<module-name>/
  components/   reusable components, one component per file
  hooks/        reusable hooks
  atoms/        reusable jotai atoms
  types.ts      types shared inside the module
```

- Create only the folders a module needs.
- Files are kebab-case (`user-card.tsx`, `use-session.ts`, `session-atom.ts`). Components are exported by name, not default.
- Components and hooks are for **reuse**. Code used by a single page stays in that route file.
- A module must not import another module's internals through relative `../` paths that reach into its folders sideways; import the specific file by path from `src/modules/<other>/...`. Cross-module imports are fine, but keep dependencies one-directional.

## Layering

Keep concerns separate; each layer only talks to the one below it.

```
routes/        thin pages: read params, compose components, no state logic
  -> modules/<name>/components/   UI for one feature
     -> modules/<name>/hooks/     read and change state, own side effects (toasts, navigation)
        -> modules/<name>/atoms/  jotai atoms and mock/seed data
```

- **Routes never import atoms.** Use the module's hook (`useThreads`, `useProjects`, `useMembers`, ...).
- **Components never import atoms.** They call hooks. Components may import other modules' _hooks and components_, never their atoms.
- **Hooks own mutations.** Creating, removing or archiving something, and the toast that confirms it, live in a hook, not in a component or route.
- Keep one hook per file, named `use-<thing>.ts`.
- Dependencies between modules are one-directional (e.g. `projects` -> `threads`, `navigation` -> `projects`/`threads`, `auth` -> `navigation`). Do not create cycles.
- Shared, feature-agnostic helpers go in `src/lib/` (`format.ts`: `timeAgo`, `initials`). Shared, feature-agnostic UI goes in `src/components/` (`page-header`, `stat-card`, `text-field`, `form`).

## Imports

- Inside one module: relative (`../hooks/use-threads`).
- Anywhere else: the `@/` alias (`@/components/button`, `@/lib/format`, `@/modules/threads/hooks/use-threads`).
- Never reach into another module with `../../`.

## `src/components/`

Shared, feature-agnostic UI primitives (`button.tsx`, `text-field.tsx`, ...) live in `src/components/`, **not** in a module. They are the only place that imports `@base-ui/react`. Feature components still go in `src/modules/<name>/components/`.

## `src/lib/`

Singletons and thin clients that are not feature code (`auth-client.ts`, `api.ts`) live in `src/lib/`. Anything with UI, hooks or state belongs in a module.

## No barrel files

Never create `index.ts` files that only re-export. Import from the exact file:

```ts
import { Button } from "../components/button";
```

Enforced by the `aven/no-barrel-file` lint rule.

## Pages live in `src/routes/`

Pages are written directly in the route file (TanStack Router, file-based). Do not create a `pages/` folder or put page components in modules. A route file holds the `Route` export and its page component; pull reusable pieces out into a module's `components/`.

`src/routeTree.gen.ts` is generated. Never edit it.

## Styling and UI

- Tailwind 4 utility classes only; no CSS modules or CSS-in-JS.
- Build UI on Base UI (`@base-ui/react`) headless primitives, styled with Tailwind, and wrap them in `src/components/`. Never use native `button`/`input`/`form`/etc.; see `0003-ui-primitives-base-ui.md`.
- State: local `useState` first; jotai atoms in a module's `atoms/` for shared client state.
