# 0262. The ship button says which pull request it will touch

Status: accepted. Refines the labels of decision 0184.

"Ship" said nothing about whether it would open a pull request or push to one that exists, and "Update PR" did not say which.

- With unshipped work the button reads `Open PR` (the thread has no pull request), `Update PR #n` (the newest one is open) or `Open new PR` (the newest is merged or closed).
- Only the first, which starts the thread's first pull request, is the filled primary button; the others are outlines as before.
- The menu entry `Ship as a new PR` is unchanged.
