# The ship bar does not hold an invisible place

Status: accepted.

## Context

While the ship bar was reading what it can ship, the Ship button and the changes badge were drawn as invisible placeholders that still took their width (112px for the button). The pull request chip comes from the thread itself, so it showed at once and sat to the right of a blank gap. Two things made the gap last:

- On a page load the action waits for the ship readiness check and the unshipped diff, each of which goes through a runner call with a 10 second timeout, so a slow runner left the gap for up to about 20 seconds.
- A running thread with no unshipped changes and no pull request never reads its branch, so the action stayed loading for the whole run.

## Decision

- A placeholder stays invisible for the first 600ms, so a fast load does not flash, and then fades into a pulsing block of the same size so the wait is visible.
- While the agent works or a ship is running, an unread branch gives no action instead of loading.

## Consequences

- A slow check reads as a pulsing placeholder, not an unexplained gap.
- A running thread with nothing to ship yet shows no empty place for the whole run.
