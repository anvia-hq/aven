# A project is a glass ring that colors and turns while it works

Status: accepted. Supersedes the gradient tile with an initial; changes where a running thread is shown (0096).

## Context

A project was drawn as a gradient square with its first letter, and a running thread added three rows of three dots beside it. Two projects with the same initial looked alike, the dots were a second mark for one thing, and the tile said nothing of what the project was doing.

## Decision

- A project is a glass ring drawn on a canvas (`projects/orb-art.ts`, `components/project-tile.tsx`): a ring and two or three tilted rings inside it, all one stroke width and full ellipses, a faint glass tint, and dust that drifts out past the ring. The project's id decides the tilt, the turn, the light and the dust, so a project always looks the same and no two do. There is no initial.
- At rest it is one ink color, the page's muted text, so the sidebar stays quiet and follows the theme.
- While one of the project's threads runs it fades into the project's palette (`tile.ts`, the palettes of 0062's kind) over about 0.45 s, the inner rings turn, the light sweeps round the edge and the dust streams outward in a seamless loop. When it stops the color fades out as the rings keep turning, then they rest where they were, so nothing jumps. With reduced motion the colors show and nothing moves.
- The sidebar's `SidebarProjectTile` passes `working` to the tile instead of adding `WorkingDots`; the tile is named Working to a screen reader only while it works. The dots stay under the conversation, beside the working word and time.

## Consequences

- One mark says both which project and whether it works.
- A canvas per tile: the shape is made once per project, painting is arithmetic, and only working tiles run a frame loop (one `requestAnimationFrame` each, paused by the browser when the tab is hidden).
