# Cockpit pages are laid out as Notion pages

Status: accepted. Changes the layout of 0105 (the inbox and notes as split views); keeps its BlockNote bodies, autosave and `?item=`/`?note=`.

## Context

The first split views of 0105 put a boxed list and a boxed form side by side: a header card, a bordered capture field and full-width tabs above the list, and over the record a row of buttons, a small title, a tag box and a document indented past the title by the editor's own margin. They read as forms, not as pages to write in. The person asked for the inbox and notes to be as clean as Notion.

## Decision

- **A record opens as a page** (`components/document-page.tsx`): a quiet bar with a breadcrumb (`Notes / title`, `Inbox / title`) and the page's actions, then one centred column of at most 46rem with a large title (2.5rem, wrapping, `Untitled` when empty, Enter goes on to the document), its properties as label-and-value rows (`Properties`, `Property`: tags, status, when it was made), a hairline and the document. Nothing is boxed; the tag field is chips and a quiet `Empty` (`TagInput`'s `bare`). Less common actions, as Delete, are in a `…` menu.
- **The document lines up with the title.** The page sets a gutter (`--doc-gutter`, 1.25rem, 3.5rem from 48rem wide) that is the column's side padding and the editor's, and the editor is pulled out by it, so its text starts where the title does and its block handles sit in the margin, as Notion's do.
- **Notes are pages, not a split view.** `/cockpit/notes` is a page listing them as a Notion database does (`components/notes-index.tsx`: a large title, a search and New note, a quiet row a note with its title, the start of its text, a pin and when it changed); `?note=` opens one as a page in its place, with the breadcrumb back. Pinned notes are listed in the cockpit's sidebar, as Notion's favourites.
- **The inbox stays a mail view** (the person's earlier ask), made quiet: a small header with Open and Done as line tabs and a + button, rows without borders that are tinted on hover and when open, and the item open beside them as a page.
- **A new inbox item is a draft until it is added.** + opens `?item=new`, a page like an item's own with its title chosen (`components/inbox-draft.tsx`); Add to inbox (or ⌘/Ctrl+Enter) creates it with its title, tags and details and opens it in the draft's place, and Cancel discards it, nothing of it sent.

## Consequences

- Moving between notes is through the index, the pinned notes or the browser's back, not a list kept beside the note.
- The task dialog keeps its bordered editor: it is a form in a dialog, not a page.
