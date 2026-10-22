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

## No barrel files

Never create `index.ts` files that only re-export. Import from the exact file:

```ts
import { Button } from "../modules/ui/components/button";
```

Enforced by the `aven/no-barrel-file` lint rule.

## Pages live in `src/routes/`

Pages are written directly in the route file (TanStack Router, file-based). Do not create a `pages/` folder or put page components in modules. A route file holds the `Route` export and its page component; pull reusable pieces out into a module's `components/`.

`src/routeTree.gen.ts` is generated. Never edit it.

## Styling and UI

- Tailwind 4 utility classes only; no CSS modules or CSS-in-JS.
- Build UI on Base UI (`@base-ui/react`) headless primitives, styled with Tailwind, and wrap them in `src/modules/ui/components/`.
- State: local `useState` first; jotai atoms in a module's `atoms/` for shared client state.
