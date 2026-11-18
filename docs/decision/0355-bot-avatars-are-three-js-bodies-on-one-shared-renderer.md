# Bot avatars are three.js bodies on one shared renderer

Status: accepted. Replaces how decision 0062 drew a bot (twelve flat SVG shapes) and the motion of 0265 (a hop and a nine second routine moved in CSS). The picker, the twelve shape names, the palette and the seeded choice of a look are unchanged.

## Context

The flat shapes read as icons, not as characters. The person wanted soft, glossy bodies with real eyes, like a clay figure, in the same twelve shapes. The motion could not be done in CSS: a squash and stretch on a hop, a wobble on landing and eyes that follow the pointer need a body with depth and light.

## Decision

- **A body is a signed distance field.** Each shape is a function in `avatar-shapes.ts`: the flower is five spheres blended smoothly, and the others are a small 2D core (a segment, a box, a hexagon, a rhombus) inflated into a pillow, so every surface is round and none is flat. `avatar-body.ts` finds the surface along each ray of a sphere mesh, takes the normals from the field and paints a vertex gradient (the color, lighter on top, a hotter blush on the front of the lower half). A shape's geometry is built once and cached; each bot gets its own colors.
- **Eyes sit on the surface** at a place each shape names, turned to the surface normal: a white, a black pupil with two glints, and a lid that blinks. The pupils follow the pointer, or dart about while the bot works.
- **Motion is plain functions** (`avatar-motion.ts`, no three.js): the hop is keyframes through a Hermite curve, with a crouch, a stretch, an arc and a squash on landing that makes the body wobble. Idle floats, breathes, blinks and turns toward the pointer. Bots that start working together do not hop in step. With reduced motion a bot holds one still pose.
- **One renderer for every avatar.** A page can show dozens of avatars, and a browser allows only a handful of WebGL contexts. `avatar-stage.ts` keeps one offscreen `WebGLRenderer`, draws each visible avatar into a small viewport and copies it into that avatar's own 2D canvas. Each avatar stays inside its box, scrolls and stacks like any element, and never floats over a dialog. Only avatars on screen are drawn (`IntersectionObserver`).
- **three.js loads on first use**, as its own chunk (`import("../avatar-stage")` from `hooks/use-bot-avatar.ts`). Until then, and when WebGL is not available, the avatar draws a flat dot with two eyes (`avatar-fallback.ts`).
- The `avatar` JSON a bot stores is unchanged, and so are the family and color a bot's id picks. The four faces (smile, grin, curious, glance) are gone: one face rig does every look.

## Consequences

- Avatars look and move as in the approved prototype, at 20 px and at 72 px.
- A new dependency: `three` (545 KB minified, 136 KB gzipped, in its own chunk) and its types.
- The native clients and the macOS app still draw the old shapes. They would need the same fields in Swift to match.
- The e2e tests read `canvas[data-mood]`, `data-family` and `data-color` where they read the SVG.
- Drawn by the same hand, so shapes can be added in one place: a field and an eye placement in `avatar-shapes.ts`.
