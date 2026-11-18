# A computer's box is the cube alone

Status: accepted. Replaces the inner frames of 0335.

## Context

0335 chose a single plain cube that turns freely, and drew it with two or three frames inside it that spun on their own, as the sandbox orb has rings inside it. On a screen the frames are not what the mark is: the cube's faces and edges are, and the frames are lines across them that only appear at sizes larger than a sidebar row, the working line or a project card's thread.

## Decision

- `paintBox` draws the visible faces' shading and the twelve edges, and nothing inside them.
- `BoxShape` no longer carries `frames`, and `BoxFrame` is gone; `boxShape` no longer picks their tilt, width or speed.
- The rest of the mark stands as 0335 decided: one cube, a real perspective camera, a light that moves, the project's palette and `paintDust` while its thread works.

## Consequences

The box is a plain cube at every size it is drawn. The proof page and screenshot of 0335 (`.aven/proof/computer-box/demo.html`, `after.png`) still show the frames: they record that change, and no screen draws them.
