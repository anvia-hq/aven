# 0286. The ship bar shows nothing while it loads

Status: accepted. Supersedes 0214's pulsing placeholders.

While the ship action and the changes badge were loading, the bar drew an empty button-sized block, which pulsed after 600ms. It read as a button with nothing in it.

- The Ship button and the changes badge render nothing until they know what they are. They appear when there is something to show.
- The placeholder components, `useElapsed` and `SLOW_LOAD_MS` are removed.
- The rule of 0214 that a running thread with nothing to ship gives no action instead of loading stays.

The pull request chip, which comes from the thread itself, still shows at once, so the buttons appear to its right when they are ready.
