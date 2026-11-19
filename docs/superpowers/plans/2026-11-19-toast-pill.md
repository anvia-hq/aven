# Toast Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bottom-right toast a 32px one-line pill whose description opens on hover or focus, with the close button and icon centered.

**Architecture:** One component file changes: `packages/ui/src/toast.tsx`. The Base UI toast primitives keep owning stacking, swipe, timing and the `data-expanded` state; only the Tailwind classes of the viewport, root, content, title, description, icon and close change. No call site changes.

**Tech Stack:** React 19, Base UI Toast 1.9, Tailwind 4 utilities, Tabler icons.

**Spec:** `docs/superpowers/specs/2026-11-19-toast-pill-design.md`

## Global Constraints

- No comments in TypeScript; no raw palette colors; semantic tokens only.
- All 93 `toast.add` call sites stay untouched: same copy, same types.
- Icons stay `@tabler/icons-react`; the component is the only file that changes.
- Before each commit: `bun run typecheck`, `bun run lint`, `bun run format:check`; commits signed off (`git commit -s`).
- Measured targets: 32px collapsed, 50px with a one-line description, 66px with two lines at the 350px cap, 6px peek per stacked card, 94%/88% scale.

## Review Focus

- A toast without a description on a touch screen must stay 32px and not grow on tap.
- A toast with a description on a touch screen must show it at rest, clamped to four lines.
- Keyboard focus inside a toast must reveal its description; the close button is the focus target.
- A stack of three keeps one width, peeks 6px, hides the behind cards' content until expanded, and every expanded card reaches its own height.
- `The update did not finish` (three lines of copy) must clamp at four lines and never exceed 350px wide; with reduced motion the text is simply there, no transition.

---

### Task 1: Restyle the toast as a pill

**Files:**

- Modify: `packages/ui/src/toast.tsx` (viewport, root, content, title, description, icon, close)

**Interfaces:**

- Consumes: nothing new.
- Produces: the unchanged exports `Toaster`, `toast`, `createToastManager`, `useToastManager`; `ToastIcon` keeps its signature `{ type: string | undefined }`.

- [ ] **Step 1: Change the viewport cap to 350px**

In `ToastViewport`, replace `max-w-sm` with `max-w-[350px]`; keep every other class.

- [ ] **Step 2: Change the root to the borderless pill**

In `Toast`:

- `rounded-2xl border` becomes `rounded-xl` (no border).
- Keep `bg-popover text-popover-foreground shadow-lg`, `only:w-fit`, `max-w-full`, the z-index, the focus ring and all `data-*` transform rules.
- Add `hover:h-auto! focus-within:h-auto!` beside `data-expanded:h-(--toast-height)` so the card can grow past Base UI's measured height.
- Set `[--peek:0.375rem]` and `[--scale:calc(max(0,1-(var(--toast-index)*0.06)))]`; keep `--gap:0.75rem`, `--height`, `--offset-y` and `--shrink` as they are.

- [ ] **Step 3: Make the content one line that opens upward**

In `ToastContent`, start from `flex h-full items-center gap-2 overflow-hidden px-3 py-1 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100`.

Add, guarded so a title-only toast never grows:

- `data-expanded:has-[[data-slot=toast-description]]:items-start`
- `data-expanded:has-[[data-slot=toast-description]]:py-2`
- `[@media(hover:none)]:has-[[data-slot=toast-description]]:items-start`
- `[@media(hover:none)]:has-[[data-slot=toast-description]]:py-2`

`has-[[data-slot=toast-description]]` is safe because Base UI renders `ToastDescription` only when the toast carries one.

- [ ] **Step 4: Set the title, description, icon and close**

- `ToastTitle`: `truncate text-[0.8125rem] leading-4 font-medium`.
- `ToastDescription`: `line-clamp-4 max-h-0 overflow-hidden text-xs leading-4 text-muted-foreground opacity-0 [contain:inline-size] transition-[max-height,margin-top,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none` plus `group-data-expanded/toast:mt-0.5 group-data-expanded/toast:max-h-16 group-data-expanded/toast:opacity-100` and the same three with `[@media(hover:none)]:` instead of the group variant.
- `ToastIcon`: keep `size-4`, add `self-center` to the wrapper.
- `ToastClose`: `size="icon-xs"`, add `self-center`, and render `<IconX className="size-3.5" aria-hidden="true" />`.
- In `ToastList`, the text column becomes `flex min-w-0 flex-1 flex-col` (drop `gap-1`).

- [ ] **Step 5: Typecheck, lint and format**

Run: `bun run typecheck && bun run lint && bun run format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/toast.tsx
git commit -s -m "Make a toast a one-line pill that opens its description"
```

---

### Task 2: Record the decision and the system reference

**Files:**

- Create: `docs/decision/0362-a-toast-is-a-pill-that-opens-its-description.md`
- Modify: `docs/products/0007-system-reference.md`

**Interfaces:**

- Consumes: the measured values from Task 1.
- Produces: nothing code-visible.

- [ ] **Step 1: Write the decision doc**

Follow `docs/decision/` style: `# A toast is a one-line pill that opens its description`, `Status: accepted`, `## Context`, `## Decision`, `## Consequences`. Record: 32px pill, radius 12, no border, 13px title, 16px icon and 24px close both centered, description revealed on hover/focus and permanently visible under `hover: none`, 6px peek and 94/88% scale, and the tradeoff that the reason of an error is not visible until the pointer or focus arrives.

- [ ] **Step 2: Update the platform section of the system reference**

In `docs/products/0007-system-reference.md`, under the platform's modules list, add one line naming `packages/ui/src/toast.tsx` as the single toast surface and stating the pill rules in one sentence.

- [ ] **Step 3: Format**

Run: `bun run format:check`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add docs/decision/0362-a-toast-is-a-pill-that-opens-its-description.md docs/products/0007-system-reference.md docs/superpowers/specs/2026-11-19-toast-pill-design.md docs/superpowers/plans/2026-11-19-toast-pill.md
git commit -s -m "Record the toast pill and its reason"
```

---

### Task 3: Verify the real component in a browser

**Files:**

- Create (temporary, deleted before the commit): `apps/platform/toast-proof.html`, `apps/platform/toast-proof.tsx`
- Create: `.aven/proof/toast-pill/after.png`

**Interfaces:**

- Consumes: `Toaster`, `toast` from `@aven/ui/toast`; `apps/platform/src/index.css`.
- Produces: a proof screenshot and a measurements log.

- [ ] **Step 1: Build a throwaway page that renders the real component**

`apps/platform/toast-proof.html` loads `/toast-proof.tsx`; the module imports `./src/index.css`, mounts `<Toaster>` and calls `toast.add` with: a success without a description, an error with `ANTHROPIC_API_KEY is not set`, and the three-line `The update did not finish` error. Start `bun run dev` in `apps/platform` (Vite alone; the toasts need no API).

- [ ] **Step 2: Measure the states with Playwright**

Drive Chrome with `channel: 'chrome'` and record:

- collapsed height 32 and width fitting the title (≤350);
- hover: the description is visible and the card is 50px for one line, 66px for two lines;
- a three-card stack: 6px between visual tops, 94%/88% scales, one width;
- `page.emulateMedia({ reducedMotion: 'reduce' })`: text visible without a transition;
- `hasTouch: true` context: descriptions visible at rest.

Expected: every value matches; fix the classes and repeat until it does.

- [ ] **Step 3: Capture the proof**

Screenshot the harness in light and dark to `.aven/proof/toast-pill/after.png` (the before half comes from the old 384px card captured the same way).

- [ ] **Step 4: Remove the harness and run the checks**

Delete `apps/platform/toast-proof.html` and `apps/platform/toast-proof.tsx`; stop the dev server.

Run: `bun run typecheck && bun run lint && bun run format:check`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add .aven/proof/toast-pill
git commit -s -m "Show the toast pill before and after"
```
