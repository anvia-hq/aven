# A thread's mark is the computer it runs on

Status: accepted. Follows 0335, which drew the box and left it unused. Superseded in part by 0405 (the marks carry no project seed).

## Context

The box painter (`modules/computer/box-art.ts`, decision 0335) had no place in the interface: every mark was still the project's orb, whether a thread ran on the person's machine or in a cloud sandbox. The decision says orb for sandboxes and box for computers, and the runtime already says which a thread has: `isSandbox(runtime)` is true for a cloud runtime and for the child runtime a cloud thread gets (`isCloud`, `parentRuntimeId`).

## Decision

- `modules/threads/components/thread-mark.tsx`'s `ThreadMark` draws the mark of a thread's environment: the box when its runtime is not a sandbox, the orb otherwise. A runtime the list does not hold yet draws the orb, so a cloud thread never flips from box to orb once the list arrives.
- `modules/computer/components/computer-tile.tsx`'s `ComputerTile` paints the box through the shared canvas, seeded by the project's id, so a thread's box carries its project's colours, light and dust.
- `modules/marks/components/mark-canvas.tsx` is the canvas lifecycle both marks share, taken from `ProjectTile`: sizing at the device pixel ratio, the ink read from the element's color and re-read on a theme change, reduced motion, the 450ms fade into the working colour and the clock that turns the mark. `modules/marks/ink.ts` reads the ink; `types.ts` holds the frame a mark paints.
- The places: the working indicator under a thread's composer, a sidebar row (single, paired or shared), the thread lists, and a running thread in a project's card on the board.
- A project's own marks stay orbs: the project board's card, the project title and a bot's mention of a project (`ProjectTile`).
- Both marks animate only while a thread works, as the orb already did; at rest a box is still, in the page's ink.

## Consequences

A thread on the person's machine shows a box wherever its mark is drawn, and a thread in a cloud sandbox keeps its orb; the two are the same family because the project seeds them both. `project-ink.ts` moves to the marks module as `ink.ts`, since neither mark owns it any more.
