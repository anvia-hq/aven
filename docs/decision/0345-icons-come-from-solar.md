# Icons come from Solar

Status: accepted. Replaces the icon library of `docs/rules/0003-ui-primitives-base-ui.md`.

## Context

The platform and `@aven/ui` drew their icons with `@mynaui/icons-react`. The product's look is moving to Solar, whose set is larger (1,500 icons in each of six styles) and has a bold style that sits with the linear one.

## Decision

- Icons come from `@solar-icons/react`, imported by style and name: `import { AltArrowDownIcon } from "@solar-icons/react/linear"`. Linear is the default; the filled icons (a favourite star, the stop square, a project's folder in the picker) come from `@solar-icons/react/bold`, aliased `StarBoldIcon` where a file uses both.
- `@mynaui/icons-react` is removed from `apps/platform` and `packages/ui`.
- Solar has no brand marks, so `GithubMark` in `apps/platform/src/components/brand-icons.tsx` draws the GitHub mark.
- A vendored shadcn component keeps the alias it was converted with, so its JSX does not change (`LoaderIcon as Loader2Icon`).

## Consequences

- Names differ from Mynaui's: chevrons are `AltArrow*`, search is `Magnifier`, settings is `Settings`, a plus is `Add`, a trash is `TrashBinMinimalistic`. The mapping is in `docs/rules/0003-ui-primitives-base-ui.md`.
- Solar's linear icons are drawn at a 1.5 stroke, as Mynaui's were, so a size class and `strokeWidth` carry over.
