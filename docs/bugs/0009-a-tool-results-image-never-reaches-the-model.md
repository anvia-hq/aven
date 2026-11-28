# A tool result's image never reaches the model on a chat completions endpoint

Status: worked around by refusing `view_image` for a run whose endpoint carries no tool-result images; found on 2026-11-28 with `@anvia/openai` 1.3.8 and DeepSeek-V4.1-Flash.

## Symptom

A thread's tool list says `Inspected 2 images`, both calls finished without an error, and the model then writes "I can't view images directly in this session" and builds something to read pixels itself (a luminance dump, a PNG parser). Nothing in the transcript says the pictures were never shown.

## Cause

`view_image` returns the picture as a `file` content part of its output (`packages/agents/src/tools/view-image.ts`), and the chat completions adapter of `@anvia/openai` writes a tool result as text only: every part that is not text becomes `[file:<mediaType>]` (`toolResultToText` in its `dist/index.js`). The Chat Completions API has no place for an image inside a tool result, so the adapter degrades instead of failing. Anthropic, Gemini and OpenAI's Responses API pass the image through, and there the tool works.

`capabilities.imageInput` does not help: the chat model reports `true` because a _user message_ may carry an image. The tool result is the case it cannot express, so no request is refused and no error is raised.

Aven reaches chat completions for the `openai-compatible`, `bedrock` and `vertex` providers, and for an Azure deployment whose name is not an OpenAI model (`carriesToolImages` in `packages/agents/src/model.ts`, next to the `api: "chat"` choice in `createModel`). Azure with a deployment named `DeepSeek-V4.1-Flash` is the case that was reported.

## Workaround

Two facts decide whether a run's model can be shown an image: the transport must carry it, and the model must be able to see it (`modelCatalog.seesImages`, the flag that already refuses an attached picture on a blind model). `resolveModel` combines them into `ModelConfig.seesToolImages`, `gateway.issue` puts it on `RunModel`, and the runner acts on it:

- `toolsForRun` drops `view_image` from the box's tools and adds `createViewImageRefusal`, which keeps the tool's name, description and input schema but answers with the model's name and what to do about it — tell the person, and switch to a model that takes images. Bots get the same swap in `bot-replies.ts`.
- A field the control plane does not send (an older runner, a hosted Claude or Codex backend) leaves the tool as it was.

## Not done

The fix belongs upstream: `@anvia/openai` could say that a model takes images from the user but not from a tool (a second capability), or throw instead of flattening a tool result's image to `[file:image/png]`. Then Aven could drop its own transport check and keep only the catalog's answer.
