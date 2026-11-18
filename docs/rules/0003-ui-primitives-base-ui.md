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

Icons come from `@solar-icons/react`, by style and name (`import { AltArrowDownIcon } from "@solar-icons/react/linear"`; filled ones from `@solar-icons/react/bold`). `lucide-react` is not a dependency. Solar has no brand marks: the GitHub mark is `GithubMark` in `src/components/brand-icons.tsx`. Decision 0345.

The shadcn CLI only knows lucide, so `components.json` still says `iconLibrary: "lucide"` and newly added components will import `lucide-react`. After `shadcn add`, convert those imports to Solar, aliasing to keep the JSX unchanged (`import { CheckIcon } from "@solar-icons/react/linear"`, `import { LoaderIcon as Loader2Icon } from "@solar-icons/react/linear"`). Mapping used so far:

| lucide                        | Solar                                |
| ----------------------------- | ------------------------------------ |
| `Check`, `Minus`, `Copy`      | `CheckIcon`, `MinusIcon`, `CopyIcon` |
| `Chevron{Up,Down,Left,Right}` | `AltArrow{Up,Down,Left,Right}Icon`   |
| `MoreHorizontal`              | `MenuDotsIcon`                       |
| `X`                           | `CloseIcon`                          |
| `Search`                      | `MagnifierIcon`                      |
| `PanelLeft`                   | `PanelLeftIcon`                      |
| `CircleCheck`                 | `CheckCircleIcon`                    |
| `Info`                        | `InfoCircleIcon`                     |
| `TriangleAlert`               | `DangerTriangleIcon`                 |
| `OctagonX`                    | `DangerIcon`                         |
| `Loader2`                     | `LoaderIcon`                         |
| `LogOut`                      | `LogoutIcon`                         |
| `Plus`                        | `AddIcon`                            |

## Enforcement

`aven/no-native-primitives` (custom oxlint rule; `src/components/` is excluded from lint) errors on `<button>`, `<input>`, `<select>`, `<textarea>`, `<label>`, `<form>`, `<fieldset>`, `<dialog>`, `<progress>` and `<meter>` in JSX.
