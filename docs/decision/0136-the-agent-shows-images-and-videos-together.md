# 0136: The agent shows images and videos, several at once, as a grid

Status: accepted. Carries on from 0033 (the agent shows images), which it replaces where they differ.

## Context

`show_image` showed one PNG, JPEG, GIF or WebP a call. An agent that proves its work (a screenshot of each page it changed, a recording of a flow) shows many files, and a video was not possible.

## Decision

- **`show_artifact { items: [{ path, caption? }] }`** replaces `show_image`: one to twelve files in one call, each an image (PNG, JPEG, GIF or WebP, up to 8 MiB) or a video (MP4 or WebM, up to 10 MiB), told by its first bytes and never its name. The runner keeps a copy of each as it did an image (0033). A file that cannot be shown does not stop the others: the result lists what was shown and what failed and why, and the call fails only when nothing could be shown.
- **The video limit is the connection's.** A runner sends a file to the control plane as one base64 message, which the control plane takes up to 16 MB of. Longer recordings need a stream, which this does not add.
- **The transcript carries a list.** `ToolPart.artifacts` and the `tool_end` event's `artifacts` (wire version 44) replace `image`. A transcript made with `show_image` still shows its image: the projection reads that tool's old result into a list of one.
- **The control plane answers a `Range` request**, since a browser asks for a video in pieces and Safari plays one only then. The file is read through the runner whole and a piece is a slice of it; a range outside the file is 416.
- **The platform draws one call's files together.** One file is shown as large as it fits, as an image was. Two or more are a grid of equal tiles (two columns, three from a wide screen): an image opens in a viewer that goes between the call's images with the arrow keys, and a video plays in its tile. A file that does not load says so, with a retry.
- **The instructions** tell the agent to give every file to one call, and the proof section to use it. Subagents have no `show_artifact`, as they had no `show_image`.

## Consequences

- A runner that has not updated is refused until `aven update` (wire 44).
- A video is held in memory whole on the runner and the control plane while it is served; the limit keeps that small.
- The model still does not see what it shows (0033).
