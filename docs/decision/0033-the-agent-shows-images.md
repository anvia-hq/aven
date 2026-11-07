# The agent shows images in the conversation

Status: accepted; `show_image` is replaced by `show_artifact`, and one image by a list of images and videos, in 0136. Builds on 0010 (per-thread workspaces), 0012 (the sandbox's tools) and 0031 (reading a thread's files through the runner).

## Context

An agent can make an image in its sandbox (a chart plotted with matplotlib, a screenshot it saved), but a person could only see it by asking for the file or opening the desktop. The conversation should show it where the agent made it.

## Decision

- **The agent shows an image with a tool, `show_image { path, caption? }`** (`packages/agents/src/tools/show-image.ts`). Text naming a file is not showing it; a tool call is explicit, and its result is where the image goes in the transcript.
- **The runner keeps a copy, outside the sandbox.** The tool reads the file through the sandbox (so `/tmp/plot.png` works as well as a workspace path) and the runner writes it to `<AVEN_RUNTIME_HOME>/artifacts/<thread id>/<uuid>.<ext>` (`runtime-client/src/artifacts.ts`). So an image:
  - still loads after the thread's container is released, or the runner restarts;
  - stays as it was when shown, even if the agent rewrites or deletes the file;
  - never shows in the thread's changes (0030), since it is not in the repository;
  - cannot be reached by the agent, which sees only `/workspace` and its container, so it cannot swap one or plant a link to the host.
- **Only PNG, JPEG, GIF and WebP, at most 8 MiB, recognised by their first bytes.** SVG is refused: it can carry script. The type comes from the bytes, not the file name.
- **The image is a field of the tool part (`ToolPart.image`, `{ name, mediaType, caption? }`), carried on `tool_end`.** The projection reads it from the tool's JSON result, so a transcript rebuilt from memory has it too. The control plane checks it like the rest of a runtime's events: the name must be one a runner gives (a uuid and an image extension).
- **`GET /threads/:id/artifacts/:name` serves the bytes** (wire version 12: `artifacts.read {threadId, name}`, answered with `{ mediaType, data }` in base64, or null). It is scoped to the caller's organization like the files and the diff. The response is `immutable` (a name is never reused), `nosniff`, and sandboxed by its Content-Security-Policy.
- **The platform shows a done image on its own, under the text before it**, not inside the collapsed group of tool calls, as a question does. Clicking it opens it full size. If it does not load (the runner is offline) it says so, with a retry.

## Consequences

- Images are not shared between runners: a thread's images live on the runner that holds it, as its workspace does. A runner that is gone for good takes them with it.
- Nothing deletes a thread's images yet; they grow with use, as workspaces do.
- The model does not see the image, only that it was shown. Letting a model with vision look at its own chart would put the bytes in its history; that can come later.
- The sandbox image has `python3` but no matplotlib or pip; an agent that wants to plot has to bring them.
