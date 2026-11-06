# A new thread opens before its first message is sent

Status: accepted. Adds to 0117 (a sent message shows at once in the thread).

## Context

Sending from the new-thread screen made the thread, then sent its first prompt, then asked for the thread list, and only then opened the thread. The person looked at an unchanged screen through three requests, the slowest being the one that has the runner set the run up, and the message appeared only when the thread did.

## Decision

The screen makes the thread (the one request the thread's address needs), puts it in the list at once (`useThreads`' `add`), hands the first prompt to the thread's page (`first-prompt.ts`) and opens it. The page sends the prompt as any message sent from a thread (`useFirstPrompt` calls `useThread`'s `send`), so it shows at once as sent, and the list is asked for again afterwards. The prompt is taken on the next tick, so a development effect that runs twice sends it once.

## Consequences

The thread opens after one short request instead of three, with the message already in it. A prompt the server refuses (the runner is offline, say) is reported in the thread, as before, and its text is not kept in the composer, as before.
