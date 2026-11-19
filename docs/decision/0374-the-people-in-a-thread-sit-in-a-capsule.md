# The people in a thread sit in a capsule

Status: accepted.

## Context

A multiplayer thread's row in the sidebar showed its people as overlapping avatars. The initials circle was translucent, so a photo behind it showed through, and a thin ring made the group hard to read.

## Decision

- The avatars sit in one rounded capsule with a hairline border and a soft background, and the count of the others ("2+") sits inside it.
- The capsule's colour is a variable (`--capsule`) mixed from the row's own colour, so it follows hover and the active row. The avatars' rings use it, which cuts a clean gap between them.
- An initials circle is opaque.
- The accessible label and the three-avatar limit are unchanged.

## Consequences

- The group reads as one unit and apart from the time.
- The row's colours for hover and active are repeated in the capsule's classes.
