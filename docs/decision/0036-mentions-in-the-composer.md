# Mentions in the composer

Status: accepted. Builds on 0031 (the Files panel), 0034 (attachments) and 0035 (skills).

## Context

Users want to point the agent at a file of the workspace, or ask it to use a skill, without spelling out a path and hoping the agent reads it as one. Typed text cannot tell `@src/app.ts` meant as a file from an email address, or `/notes` meant as a skill from a path. `@anvia/react-ui` has a composer (`ComposerPrimitive`, `@anvia/react-ui/chat`) built on tiptap, whose triggers turn a picked item into a token (an _entity_) with its place in the text.

## Decision

- **The platform's composer is Anvia's.** `PromptInput` is `ComposerPrimitive.Root` and `.Input` (tiptap), with two triggers: `@` finds a file of the thread's workspace, `/` a skill. A picked item is a token drawn as a chip; it is deleted as a whole. Attachments, the model menu, Send and Stop stay ours. The composer needs a `ChatProvider`, and our runs are not Anvia's transport, so it is given a chat that is always ready (`use-composer-chat.ts`), and `PromptInput` sends. Enter sends unless the menu has something to pick, so a message of files alone, or text after a `/` that matches no skill, still goes.
- **`@` is only in a thread**: a new thread has no workspace yet. It asks the runner, `GET /threads/:id/files/search?q=` → `files.search` (wire version 15), which matches the query against what `git ls-files` lists (tracked and untracked, minus ignored and deleted files), names first, at most 50. Nothing is read.
- **`/` offers the skills a run would have**: the repository's own (in a thread, the folders of `.aven/skills`), the user's enabled ones and the built-in ones, the first winning on a name, as in 0035.
- **A message carries its mentions**: `mentions: [{ type: "file" | "skill", name, from, to }]`, where `from`/`to` is the token (`@<path>` or `/<name>`) in the trimmed prompt. The control plane refuses a mention whose token is not there, a path that is absolute or has `..` or an empty part, or a name that is no skill's. They go to the runner with `run.start` and to the transcript with `run_start`.
- **The agent is told what was meant**, in a note after the user's text: the files, as `/workspace/<path>`, and the skills, with each one's `SKILL.md` path from the run's skill list and an instruction to read and follow it; a skill the run does not have is said to be missing. The message's metadata keeps the mentions so a reloaded thread draws its chips again.

## Consequences

- The prompt the agent sees still has the tokens in it, so it reads naturally even without the note.
- A mentioned file is not checked to exist, nor read for the agent: it reads it with `read_file` like any other, inside the sandbox.
- Paths are matched by substring; there is no fuzzy matching yet.
- The `Prompt` textbox is now a `contenteditable` (`role="textbox"`), not a `textarea`.
