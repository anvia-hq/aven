# 0179: The ship bar always offers a way forward

Status: accepted. Supersedes the silent hiding of decision 0129, refines 0069's menu and keeps
0161's bar (Ship and the changes badge at the left, Actions at the right).

## Context

The bar above the composer decided what to draw with a chain of early returns, and four of them
returned nothing: the repository is not set up, the changes are not known yet, there is nothing
unshipped, or the person is not the creator. Each of the first three left a state with no
explanation and sometimes no pull request link either, the changes badge disappeared when the
diff request failed (so "could not read" read as "nothing to ship"), a binary, mode or rename
change printed `+ 0 - 0`, and a branch pushed outside Aven lost both the button and the only way
to open a pull request. The menu that lists a thread's pull requests lived on the Ship button,
so it vanished exactly when there was nothing left to ship, and the Connect GitHub button
replaced the pull request link instead of standing beside it.

## Decision

- **Three slots, always in the same place**: the ship action, the newest pull request's chip and
  the changes badge, in that order. A slot never pops in or out while a thread is open; a state
  that is still being worked out fills it with a placeholder of the same size, so the composer
  does not move.
- **The ship action is one of**:
  - `Ship`, `Update PR` or `New PR` when there is unshipped work;
  - `Open a PR` when nothing is unshipped, the thread's branch has work against the default
    branch, and the thread has no pull request;
  - `Set up shipping` when the workspace lacks `.aven/setup` or `.aven/ship.md`: it sends the
    missing skill (`/setup-env` first, then `/setup-ship`) as the person's message, and the bar
    moves on by itself when that run ends;
  - `Connect GitHub to ship` when the person's account is not connected for the project's app;
  - nothing when there is nothing to open or update;
  - off while the agent works, while shipping, while the repository's readiness is still being
    read, when the runner cannot say whether it is set up, and when the changes could not be
    read.
- **The pull request chip is reference, not an action**: it says `#n`, with `+k` when the thread
  has more pull requests, and opens a menu of every one of them. It is drawn in every state where
  a pull request exists, including not set up and not connected. The chevron beside the ship
  action holds only `Ship as a new PR`, and only while the newest pull request is open.
- **The badge says what it knows**: `+a -d` when lines changed, `n files` when only files changed
  (binary, mode, renames), `Changes unknown` when the diff could not be read, a placeholder while
  it loads, and nothing when the branch has no changes. Clicking it opens the Changes panel on its
  Unshipped scope.
- **The Changes panel has three scopes**: Last turn, Unshipped and Full diff. The runner already
  answers the Unshipped scope; the panel now offers it, and the badge opens it.
- **Not knowing is not "up to date"**: when the diff could not be read the action's slot holds a
  `Try again` button with the reason in its tooltip, and clicking it reads the changes again; Ship
  is never offered on a diff nobody could read. While the GitHub account is still being read, the
  slot is a placeholder rather than a Ship button that would be refused with a 409.
- **`Open a PR` reads the whole-branch diff** only when the unshipped diff is empty, and the
  default ship prompt tells the agent to open the pull request when the branch is already pushed
  and nothing is uncommitted.
- **Unchanged**: a thread that is not the person's has no bar (0084), and a thread with no
  workspace has no slots.

## Consequences

- A repository that is not set up gets one quiet button that sets it up, instead of a gap and no
  explanation; 0129's point stands, since this button can be pressed.
- A branch pushed outside Aven keeps a way to a pull request, and a failed diff no longer reads as
  an empty one.
- The number in the badge can always be inspected, and never reads `+ 0 - 0` for a change that
  did happen.
- A thread with nothing unshipped costs one more diff read (the whole branch) before the bar can
  say `Open a PR` or nothing.
- The bar and its states are one function with one switch, so every row of the table in
  `e2e/ship.spec.ts` is a test.
