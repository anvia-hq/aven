# The new-thread screen shows the mark as glass

Status: accepted.

## Context

The new-thread screen was a heading and a composer on a flat background. The product wanted the Aven mark on it, as a subtle piece of glass.

## Decision

- `apps/platform/src/modules/threads/components/glass-mark.tsx` draws the Aven mark (the path of `AvenMark`) extruded and bevelled with `three`, in a translucent physical material lit by `RoomEnvironment` and one moving light. It turns a little with the pointer and on its own, stops while off screen, and stands still under `prefers-reduced-motion`.
- It is not a refracting glass: there is nothing on the page behind it to refract, and a transmission material would draw a box of its own colour. It is clear with strong reflections instead.
- `three` is the only dependency added (`@types/three` for its types). The component is loaded with `React.lazy`, so the 600 KB chunk is fetched on this screen alone.
- The canvas is `aria-hidden`; the heading stays HTML. A browser without WebGL shows nothing in its place.
- The letters A-V-E-N are not extruded: `three` ships no font files, and the mark is the brand's own shape.

## Consequences

- A new screen with a 3D mark needs the same `lazy` import so other screens stay light.
