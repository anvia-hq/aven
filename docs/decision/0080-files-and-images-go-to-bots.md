# A person sends files and images to a bot

Status: accepted. Builds on 0034 (files and images attached to a message), 0058 and 0059 (bots and their computers). A bot gets what a thread's agent gets, by the same means.

## Context

A thread's composer attaches files: a screenshot, a PDF, a spreadsheet (0034). A bot's composer had no attach button, so a person could tell a bot about a file but not give it one, though a bot has a computer of its own that could work on it and, mostly, a model that can look at an image. The person asked for the same behaviour as the thread's agent.

## Decision

- **Files travel with the message, as in 0034.** `POST /bots/:id/messages` takes `attachments: [{ name, mediaType?, data }]` (base64) beside `text`, up to the same 10 files and 10 MB together; the text may be empty when there are files. The code that checks and names them (`prepareAttachments`, the zod `attachmentBody`) is `apps/control-plane/src/attachments.ts`, shared with threads. An image is decided from its bytes (PNG, JPEG, GIF or WebP, up to 5 MB) and gets a runner's artifact name; a model the catalog says takes no images is refused with a `422` before anything is added to the chat.
- **Every file goes to the bot's computer, in `/uploads`.** `bot.reply` carries the files as `attachments` (wire version 34, an optional field); the runner (`BotReplies`) copies them to `<AVEN_RUNTIME_HOME>/uploads/<bot id>/`, which the bot's container mounts read-only at `/uploads`, exactly as a thread's, and keeps an image as an artifact under the bot's id. The bot is asked with `sentPrompt`: the person's words, a note of where each file is, and the image itself. The bot's instructions say what `/uploads` is. A runner that cannot keep files (no stores) fails the reply and says so.
- **The chat shows the message as it was sent.** The prompt is a user message whose metadata holds the person's own text and the files, which `bot.memory` stores with the chat. `botMessagesToChat` reads it back with `sentMessage`, so the note the bot was given is not the person's words and a message of only files is a message. A live message carries `attachments` on `BotChatMessage` without their bytes.
- **Images are read from the bot's own route.** `GET /bots/:id/artifacts/:name` asks the bot's runner for the image, found through the person's own bot as the bot's desktop is (`botRunnerFor`); the artifacts service takes the runner, so threads and bots share it.
- **The platform attaches from the button, by paste or by drop**, with the thread composer's hook and components (`use-attachments`, `use-attachment-drop`, `attach-button`, `pending-attachments`); the sent files and thumbnails are `sent-attachments`, which take the path to read images from. A message with files above its words is drawn as a thread's is.

## Consequences

- As in 0034, an image stays in the bot's history and goes to the model on every later turn; a bot whose model is changed to one without vision fails its replies while the image is in the chat.
- A bot's chat in Postgres and the runner's copy hold each image in base64; uploads are not shared between runners and nothing deletes them yet.
- A reply the runner loses before it kept the files has none of them; the person sends them again.
- Files go only with the person's own message: a message another bot sends a bot, and a note, carry none.
- Not tried against a real container: the tests and the e2e keep the files in a directory with no container to mount it in. The mount is the thread's own code path (`dockerRunArgs`), reached with the bot's id.
