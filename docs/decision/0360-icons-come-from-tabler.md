# Icons come from Tabler

Status: accepted. Supersedes 0346 (icons come from Solar) and the icon part of `docs/rules/0003-ui-primitives-base-ui.md`.

## Context

0346 moved the platform and `@aven/ui` from Mynaui to Solar. Solar drew its linear icons at a 1.5 stroke, which reads thin at the 16–20px sizes the interface uses most, so the first change was to weigh every icon with one value. The person then asked for Tabler instead, and for that weight to carry over.

Tabler is larger still (5,800 icons), is MIT, and draws outline and filled variants of the same name (`IconStar` and `IconStarFilled`), which is what the interface needs for state.

## Decision

- **Icons come from `@tabler/icons-react`**, imported by name: `import { IconPlus } from "@tabler/icons-react"`. Tabler's names are kept as they are, with no alias, so a call site reads the same as the library.
- **State uses the filled variant of the same name**, chosen in the component rather than with a fill class: a favourite thread is `IconStarFilled` or `IconStar`, a pinned note is `IconPinFilled` or `IconPin`, the picked project is `IconFolderFilled`, and send/stop is `IconPlayerStopFilled`.
- **One value weighs the interface.** `apps/platform/src/index.css` sets `.tabler-icon { stroke-width: 1.75 }`, which beats the `stroke-width="2"` attribute Tabler puts on every icon. An icon that needs another weight sets it inline, because inline style beats that rule: the rail and the phone's tab bar at 1.7, a subagent's status at 2.4.
- `@solar-icons/react` is removed from `apps/platform` and `packages/ui`.
- The brand marks stay our own: `GithubMark` in `apps/platform/src/components/brand-icons.tsx` still draws the GitHub mark, as it did under Solar, rather than Tabler's `IconBrandGithub`. The provider logos in that file are unchanged too.
- The vendored shadcn components keep their own names for icons (`LoaderIcon as Loader2Icon` in converted files is now `IconLoader2`), and `components.json` still says `iconLibrary: "lucide"`, since the shadcn CLI only knows lucide.

## Consequences

- Names change: a plus is `IconPlus`, search is `IconSearch`, close is `IconX`, a trash is `IconTrash`, a chevron is `IconChevronDown`. The mapping used for the migration is in `docs/rules/0003-ui-primitives-base-ui.md`.
- `--solar-stroke-width` is gone; the weight lives in the `.tabler-icon` rule, and the icons' size still comes from a `size-*` class.
- Tabler's outline icons are drawn on the same 24px grid as Solar's, at a 2 stroke by default, so a size class carries over and only the stroke needed the rule above.
