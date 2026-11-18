# A failed changes read shows nothing

Status: accepted. Supersedes the `Changes unknown` badge and the `Try again` button of decision 0184, and refines the empty slots of 0286.

## Context

0184 made not knowing visible: when the diff request failed, the changes slot held `Changes unknown` with the reason in its tooltip, and the ship action's slot held `Try again`, which read the diff again on a click. It was written because the badge used to disappear, so "could not read" read as "nothing to ship".

In use the pair is the loudest state the bar has, and it is almost always transient: a runner that was asleep, an expired sandbox, a request that did not reach the server. It puts two buttons over the composer of a thread whose changes are fine and that the person did not ask about, and it reads as a fault of the thread rather than of one request.

## Decision

- **A diff nobody could read shows nothing.** `ChangesBadge` renders nothing while `diff.problem` is set, and `ShipButton` renders nothing for the `failed` action, as it already does while it loads (0286).
- **Ship is still never offered on it.** `ship-state.ts` keeps the `failed` kind, so the action's slot stays empty on a diff nobody could read instead of falling through to Ship.
- **The reason is still told where it was asked for**: the Changes panel shows it as a `PanelNotice`, and the control plane logs it (`The diff was refused:`).
- **Nothing reads the diff on demand any more.** `useThreadDiff` loses `reload` along with its only caller. The bar reads the diff when the thread runs (every four seconds), when the thread or the scope changes, and when the page loads.

## Consequences

- The bar keeps three slots in place with no placeholder and no button that has to be dismissed, and the failure costs no space.
- A failed read on an idle thread leaves no trace in the bar until the page is loaded again. The person who wants to know opens Changes, which reads again and says why.
