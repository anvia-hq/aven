# 0272: A bot sends files and the chat shows them in a side panel

Status: accepted. Builds on 0033 and 0136 (the agent shows images and videos), 0181 (interactive pages in a sandboxed frame) and 0059 (a runner answers for a bot).

## Context

A bot can make a document on its computer (a PDF of a comparison, a report, a CSV) and can only tell the person where it is on that machine. The browser cannot read that path. Threads already show images, videos and pages with `show_artifact`, but bots are given every computer tool except that one (`bot-replies.ts` filters it out), and an artifact can be none of a PDF, markdown, CSV or text.

## Decision

- **A bot sends a file with its message.** `send_message` takes an optional `files` list (`path`, `title?`, up to 12). The runner reads each file through the bot's computer, keeps a copy in its artifact store under the bot's id (as it does a thread's, 0033), and posts `bot.say` with the kept names. The file and the words arrive as one message, so there is no order to get wrong between a "show" call and a "say" call. A thread's agent is unchanged.
- **More types, all told by their bytes or, for text, by being text.** PDF (`%PDF-`), and markdown, CSV and plain text (valid UTF-8 without NUL bytes, with the type taken from the file's extension, since text has no signature). Images, videos and pages are as before. The limit for every kind is 10 MiB, but a page stays at 2 MiB (0181).
- **A file has a title, and a title has versions.** `ToolArtifact` gets an optional `title`. A bot that sends a file with the same title as one it sent before has made a new version; none is deleted. The panel lists them newest first.
- **The chat shows a card, the panel shows the file.** A message carries a card per file (icon, title, type, size, "Open"). Opening one slides a panel in on the right of the bot chat, resizable, over the chat on narrow screens. It draws markdown, CSV (as a table), text, images and video, a PDF in the browser's viewer, and a page in the sandboxed frame of 0181, with a version picker, download and close. A type it cannot draw is a download. The open file and version are `?artifact=<name>` on the bot's route, so a refresh or a shared link comes back to it.
- **Served as safely as an image.** `GET /bots/:id/artifacts/:name` answers with the stored type, `nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`; markdown and text go out as `text/plain`, which the platform renders itself, and a PDF is served with the same policy so the browser's viewer runs without a way to reach the app. Access is the bot's owner (0044's rule for what a person's bot may do is unchanged).
- **Wire version 59.** `artifacts.read` can answer the new media types, which a control plane from before refuses, so a runner and a control plane must be updated together (0181 did the same). `bot.say`'s `files` is optional.

## Consequences

- Files live on the runner that holds the bot's computer, like images do; a runner gone for good takes them with it. Every version is kept, so the folder grows with use; a cleanup is a later decision.
- Bot messages are held by the control plane while the chat is open, so a card's file name is what the message keeps; the bytes are fetched from the runner when the card is opened, and the card says so when the runner is offline.
- The panel is for bots only. A thread's agent shows what it shows now.
