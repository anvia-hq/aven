# Cockpit bodies are BlockNote documents, and the inbox and notes are split views

Status: accepted. Changes how 0104 shows the inbox and notes and keeps their bodies; tasks' board and table stand.

## Context

The first cockpit (0104) showed the inbox as a list with a capture form and notes as a grid of cards with a markdown text box. Using it, the person wanted the inbox to look like a mail inbox, found the notes hard to use, and wanted every body (an inbox item's details, a task's description, a note) written in a block editor: BlockNote.

## Decision

- **Bodies are BlockNote's.** The editor is `@blocknote/shadcn` 0.56.0 (with `@blocknote/core` and `@blocknote/react`, pinned), whose components are Base UI and Tailwind 4 as the platform's are; it uses BlockNote's own components (ours render in portals, which it does not take). A body is kept as the editor's blocks in JSON, in the same `body`/`description` column; one written before is read in as markdown when it is first opened (`rich-text.ts`'s `blocksOf`). A list's preview is the blocks' text on one line (`plainTextOf`). An empty document is kept as no body. The editor (`rich-text-editor-view.tsx`) is loaded the first time one is shown, so the rest of the app does not carry it, and follows the platform's light or dark theme. A body may be 200,000 characters, since blocks take more room than the words.
- **The inbox is a mail app's**: a list pane with a capture line, Open and Done, and each item's title, the start of its details, when it came and its tags (the capture line and an unread mark were later dropped for a + button and a draft: 0106); beside it the item opened (`?item=`), with Done or Move to inbox and Delete above its title, tags and details.
- **Notes are a notes app's**: a list pane with a search through titles and words and a + that starts an Untitled note with its title ready to be typed over; beside it the note as a page (`?note=`), with its title, tags, pin and delete, and the document.
- **What is typed is saved as it is typed**, a moment after the typing stops and at once when the record is left (`use-autosave.ts`); there is no Save button in either pane. A task's description is BlockNote in the task's form, saved with the form.
- **On a narrow screen** a split view shows the list or the open record, with a way back (`split-view.tsx`).
- **Two-way switches are tabs** (`components/tabs.tsx`): the inbox's Open and Done, the tasks' Board and List.

## Consequences

- Bodies hold structure (headings, lists, checklists, tables, code) that markdown text did not, and the JSON is only BlockNote's to read: anything else that reads a body uses `plainTextOf`, or BlockNote's own export.
- BlockNote is a new, large dependency of the platform, loaded on demand; updating it is a change of its own, since its document format can change between versions.
