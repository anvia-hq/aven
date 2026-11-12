# Claude sees pictures, and takes them with a steering message

Status: accepted. Fixes 0242 and 0247.

## Context

The Claude backend flattened a message to its text before it reached the SDK, so a picture a person attached was never shown to Claude, which then looked for the file with its other tools. A message sent while the agent works could not carry files at all: the platform dropped them and the control plane refused them.

## Decision

- **Images go to Claude as image blocks.** A message with pictures reaches the SDK as a user message of a text block and one base64 image block per picture (png, jpeg, gif, webp). The files stay in the sandbox's uploads folder as before.
- **A steering message may carry files on a Claude thread.** The platform sends them with the message, the control plane keeps them with the queued message (names only, no bytes), and the `run.steer` call carries them as an optional `attachments` field, so the wire version does not change. The runner saves them as it does for the first message and the next tool result, or the next turn, carries the pictures.
- **A native thread keeps its rule**: files go when the agent is not working, because the model that will read the steering message is not known when it is sent.
