# The orb and the box are one drawing each that rests on one view

Status: accepted. Supersedes in part 0335 and 0342.

## Context

0335 and 0342 drew an orb for a cloud sandbox and a box for a computer, each shaped from a seed taken from the project, with rings, frames and dust that moved at their own unrelated speeds. The marks looked different for every project, and a mark that stopped working froze wherever it happened to be, so the sidebar showed many marks in many poses. The marks were then replaced in the threads sidebar by plain icons (46245bb5) because they did not look good.

## Decision

- There is one orb and one box. Nothing about their shape comes from the project: only the three colours do (the thread's colour, else the project's palette).
- Every motion in a mark repeats exactly once per turn (`turn` counts whole turns). The view of a mark is a pure function of its `turn` and its `color`, and a turn of any whole number looks the same as no turn.
- The box is a cube seen corner-on at rest and turning about its own vertical axis. The orb is three great circles in the same view, with depth: near sides are brighter, thicker and drawn on top; two of the circles tumble on their own axes while it works. The cube keeps its twelve edges and nothing inside it (0343 stands).
- `modules/marks/motion.ts` moves a mark. It eases up to one turn every 3 seconds over 1.2 seconds, and on stop it keeps turning with a steadily slowing speed to the next whole turn at least half a turn away, fading its colour and dust as it goes, so it ends at rest on the same view it started from. A stop asked for while still speeding up waits for the ramp to finish. Asking to work again while settling waits for the rest view.
- The threads sidebar draws these marks again (orb for a sandbox, box for a computer), working or not.

## Consequences

`orbShape`, `boxShape`, `boxRotation` and the per-project seed are gone, along with the `time` and `speed`-driven colour fade in `MarkCanvas`; `MarkFrame` carries `turn` instead of `time`. A mark that has just been mounted as working eases in from rest. With reduced motion a mark is drawn still, on the rest view, in colour while it works.
