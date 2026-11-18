# A computer is a turning box beside the sandbox orb

Status: accepted; 0342 gives the box its places in the interface, 0343 drops the frames inside it.

## Context

The orb marks a project, a sandbox and a working agent. We want a second mark for a computer (a thread's or a bot's folder and machine) that reads as a different thing but belongs to the same family. Four box animations were tried (spinning, a lid, a scan, small cubes); a single plain cube that turns freely was chosen.

## Decision

- `modules/computer/box-art.ts` paints one cube on a canvas with the orb's own helpers: palettes, ink, the moving light and `paintDust`.
- It has a real perspective camera (`EYE`), so near edges are larger and thicker and far ones smaller. Which faces show is worked out from the camera's position.
- Like the orb, the look comes from a seed: proportions, 2 or 3 inner frames that spin on their own, the tumble rates and the dust pattern. The same project seeds both marks.
- The rotation is a full 3D matrix, so the cube can turn in any direction (a tumble about all three axes, or one axis).
- Orb for sandboxes, box for computers; neither replaces the other.

## Consequences

The painter and its tests are added here; no screen uses the box yet. A `ComputerTile` component and its places in the interface come in a later change. `orb-art.ts` now exports `random`, `hexRgb`, `rgba`, `blend` and `paintDust` so both marks share them.
