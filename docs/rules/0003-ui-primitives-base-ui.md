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

Icons come from `@tabler/icons-react`, by name (`import { IconChevronDown } from "@tabler/icons-react"`). Outline is the default; state uses the filled variant of the same name (`IconStarFilled`, `IconPinFilled`, `IconFolderFilled`, `IconPlayerStopFilled`). `lucide-react` is not a dependency. Brand marks stay our own (`GithubMark` in `src/components/brand-icons.tsx`, not Tabler's `IconBrandGithub`). Decision 0360.

The stroke of every icon is set once in `apps/platform/src/index.css`: `.tabler-icon { stroke-width: 1.75 }`. An icon that needs another weight sets it inline (`style={{ strokeWidth: 2.4 }}`), because a `strokeWidth` prop is an attribute and the rule beats it.

The shadcn CLI only knows lucide, so `components.json` still says `iconLibrary: "lucide"` and newly added components will import `lucide-react`. After `shadcn add`, convert those imports to Tabler, keeping the JSX unchanged with an alias where the names differ (`import { IconCheck } from "@tabler/icons-react"`, `import { IconLoader2 as Loader2Icon } from "@tabler/icons-react"`). Mapping used so far:

| lucide                        | Tabler                               |
| ----------------------------- | ------------------------------------ |
| `Check`, `Minus`, `Copy`      | `IconCheck`, `IconMinus`, `IconCopy` |
| `Chevron{Up,Down,Left,Right}` | `IconChevron{Up,Down,Left,Right}`    |
| `MoreHorizontal`              | `IconDots`                           |
| `X`                           | `IconX`                              |
| `Search`                      | `IconSearch`                         |
| `PanelLeft`                   | `IconLayoutSidebar`                  |
| `CircleCheck`                 | `IconCircleCheck`                    |
| `Info`                        | `IconInfoCircle`                     |
| `TriangleAlert`               | `IconAlertTriangle`                  |
| `OctagonX`                    | `IconAlertOctagon`                   |
| `Loader2`                     | `IconLoader2`                        |
| `LogOut`                      | `IconLogout`                         |
| `Plus`                        | `IconPlus`                           |

The same names map the Solar set this replaced: `AltArrowDownIcon` was `IconChevronDown`, `MagnifierIcon` was `IconSearch`, `CloseIcon` was `IconX`, `AddIcon` was `IconPlus`, `TrashBinMinimalisticIcon` was `IconTrash`, `DangerTriangleIcon` was `IconAlertTriangle`, `MenuDotsIcon` was `IconDots`.

## Enforcement

`aven/no-native-primitives` (custom oxlint rule; `src/components/` is excluded from lint) errors on `<button>`, `<input>`, `<select>`, `<textarea>`, `<label>`, `<form>`, `<fieldset>`, `<dialog>`, `<progress>` and `<meter>` in JSX.
