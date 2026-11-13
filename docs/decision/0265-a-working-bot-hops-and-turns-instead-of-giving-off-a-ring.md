# 0265. A working bot hops and turns instead of giving off a ring

Status: accepted. Replaces the ring and the orbiting dot of decision 0062.

The ring that grew around a working bot and the dot that circled it read as a loading spinner, not as a character at work.

- A working bot keeps hopping (a plain move up and down) and runs a nine second routine: a lean to each side, a horizontal turn, a wobble, a look to each side and the turn back the other way. Its pupils dart throughout.
- **The shape is only moved and turned, never scaled or stretched.** The horizontal turn is the face sliding off one edge of the shape, cut by the shape's own outline, and coming round from the other, so it reads as 3D while the avatar stays flat. The shape does not change; only the face is masked by it.
- The routine starts and ends at rest, so a bot that begins to work moves off calmly instead of appearing mid-turn. Bots differ because they start working at different times.
- Idle is as before: a slow bob, each bot at its own time. Nothing moves for people who prefer reduced motion.
- Going back to idle still stops the routine at once.
