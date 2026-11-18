# UI primitives use Base UI, not native elements

Status: accepted

Applies to `apps/platform`.

## Rule

Interactive and form primitives must be built on Base UI (`@base-ui/react`), never on the native HTML element.

| Instead of native                                                           | Use (via `src/components/`)                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `<button>`                                                                  | `Button` (Base UI `Button`)                            |
| `<input>` + `<label>`                                                       | `TextField` (Base UI `Field` + `Field.Control`)        |
| `<form>`                                                                    | `Form` (Base UI `Form`)                                |
| `<select>`, `<textarea>`, `<dialog>`, `<fieldset>`, `<progress>`, `<meter>` | the matching Base UI part, wrapped in `ui/components/` |

- Import `@base-ui/react/*` **only** inside `src/components/`. Everywhere else, import the wrapper.
- Need a primitive that has no wrapper yet? Add one to `src/components/` first (one component per file), then use it.
- Wrappers stay headless and are styled with Tailwind; they pass props through so Base UI behavior and accessibility are kept.
- Structural and text elements (`div`, `main`, `table`, `h1`, `p`, `a`, ...) are fine natively, as Base UI has no equivalent. Links use TanStack Router's `Link`.

## shadcn/ui components

The full shadcn/ui set (`base-nova` style, Base UI variant, config in `apps/platform/components.json`) is installed in `src/components/`. Use these before writing your own, and add or refresh components with `bunx shadcn@latest add <name> --cwd apps/platform` (`--overwrite` to update). They import each other via the `@/` alias (`@/components/button`), which maps to `src/`.

`src/components/` is excluded from linting (`ignorePatterns` in `.oxlintrc.json`) and is the one place native elements are allowed, because shadcn's own `textarea`, `label`, `native-select`, `field` and `sidebar` use them where Base UI has no primitive. Everything outside `src/components/` must use the components.

Our own wrappers (`text-field.tsx`, `form.tsx`) live next to them. Hooks the CLI generates go to `src/hooks/`.

## Icons

Icons come from `@mynaui/icons-react` (import by name, e.g. `import { Plus, Moon } from "@mynaui/icons-react"`). `lucide-react` is not a dependency.

The shadcn CLI only knows lucide, so `components.json` still says `iconLibrary: "lucide"` and newly added components will import `lucide-react`. After `shadcn add`, convert those imports to Mynaui, aliasing to keep the JSX unchanged (`import { Check as CheckIcon } from "@mynaui/icons-react"`). Mapping used so far:

| lucide                                      | Mynaui           |
| ------------------------------------------- | ---------------- |
| `Check`                                     | `Check`          |
| `Chevron{Up,Down,Left,Right}`               | same             |
| `MoreHorizontal`                            | `Dots`           |
| `Minus`, `X`, `Search`, `Copy`, `ArrowDown` | same             |
| `PanelLeft`                                 | `PanelLeft`      |
| `CircleCheck`                               | `CheckCircle`    |
| `Info`                                      | `InfoCircle`     |
| `TriangleAlert`                             | `DangerTriangle` |
| `OctagonX`                                  | `DangerOctagon`  |
| `Loader2`                                   | `Spinner`        |
| `LogOut`                                    | `Logout`         |
| `LayoutDashboard`, `Moon`, `Sun`, `Plus`    | same             |

## Enforcement

`aven/no-native-primitives` (custom oxlint rule; `src/components/` is excluded from lint) errors on `<button>`, `<input>`, `<select>`, `<textarea>`, `<label>`, `<form>`, `<fieldset>`, `<dialog>`, `<progress>` and `<meter>` in JSX.
