# Users attach files and images to a message

Status: accepted. Builds on 0010 (per-thread workspaces), 0021 (durable runs) and 0033 (the agent shows images).

## Context

A person often has what the agent needs in a file: a screenshot of a bug, a mockup, a spec as a PDF, data in a spreadsheet, a deck. The composer's attach button did nothing. An image is something a model with vision can look at directly; a PDF, Word, Excel or PowerPoint file is something the agent should work on with tools in its sandbox, not something to push into the model's context.

## Decision

- **Files travel with the message.** `POST /threads/:id/messages` takes `attachments: [{ name, mediaType?, data }]` (base64), up to 10 files and 10 MB together; the prompt may be empty when there are files. There is no separate upload step, so there is nothing to orphan, and a message and its files reach the runner together on `run.start` (wire version 13). 10 MB keeps a message well inside a WebSocket frame, base64 and all.
- **Every file goes to the sandbox, in `/uploads`, not the workspace.** The runner writes it to `<AVEN_RUNTIME_HOME>/uploads/<thread id>/` (`runtime-client/src/uploads.ts`), which every container of the thread mounts read-only at `/uploads`. So a file:
  - is there whether the sandbox was running or not, and still there after it is released and started again;
  - never shows in the thread's changes (0030) and is never committed by accident;
  - cannot be changed by the agent; it copies one into the workspace when the task needs it there.
    Names are made safe for a shell (`Q3 report.pdf` becomes `Q3_report.pdf`), and a name already taken gets a number.
- **An image also goes to the model.** A file whose bytes are a PNG, JPEG, GIF or WebP (up to 5 MB, the most a model takes) is put in the prompt as an image part. The control plane decides this from the bytes, as `show_image` does, and names the runner's copy in its artifact store (0033), so the transcript shows the image from `GET /threads/:id/artifacts/:name`. An SVG is only a file: it can carry script. Other files never reach the model.
- **The agent is told.** The prompt carries a note listing each file's path, type and size and which images it is shown, and its instructions say what `/uploads` is.
- **The transcript shows the message as it was sent.** The prompt is a user message whose metadata holds the user's own text and the files (`{ name, mediaType, size, image? }`), which the memory store keeps; `messagesToChat` rebuilds `ChatMessage.attachments` from it, and `run_start` carries the same list live. The note to the agent is not shown.
- **A model the catalog says takes no images is refused** (`422`) before the run starts. Models it does not know, and the environment's own model, are let through.
- **The platform** attaches from a button, by pasting or by dropping onto the composer, checks the limits as a file is added, and shows a user message's images as thumbnails and its other files as chips. A just-sent image is in the transcript a moment before the runner has kept its copy, so a thumbnail that does not load is tried again a few times before it falls back to a chip.

## Consequences

- An image stays in the conversation's history and is sent to the model on every later turn, as the provider's own chat apps do. Switching a thread with images to a model without vision fails its runs.
- The run's journal and the transcript in Postgres hold each image in base64.
- Uploads are not shared between runners and nothing deletes them yet, like workspaces and the agent's images.
- A runner that restarts after taking a message but before writing its files loses them; the run goes on with the text alone.
- A file the browser could not type is sent as `application/octet-stream`; the agent can still look at its bytes.
