# The open thread's header carries its menu

Status: accepted.

## Context

What you can do to a thread was spread over four places. Archive sat in the sidebar row's hover menu. Sharing sat behind the header's Share button. Model and reasoning effort sat in the composer. Renaming was a double-click on the sidebar title, with nothing in the open thread saying so. A person reading a thread had to leave it to find most of what they could do with it.

## Decision

- The open thread's header carries a three-dots menu beside its title, holding Copy Thread URL, Manage Sharing, Export, Model, Reasoning, Color and Rename, in that order (`components/thread-options-menu.tsx`).
- Color sets the thread's color, for the thread's owner: one of eight presets plus Default, which puts the project's own palette back (`thread-colors.ts`). It is stored on the thread (`threads.mark_color`, nullable, a six-digit hex the `PATCH /threads/:id` body checks) rather than on the device, so a shared thread keeps it for everyone who reads it, and `useThreadColors` changes the list before the server answers.
- One color serves both the thread's title — in the open thread's header and in its sidebar row (`components/thread-header.tsx`, `components/sidebar-threads.tsx`) — and its mark, so the row reads as one thing. The mark takes three colors from it: that color, a lighter blend and a darker one (`markColors` in `projects/orb-art.ts`), handed to the tiles through a `colors` prop, so the orb and the box still own how they paint.
- The Share button stays where it was, right-aligned in the header, and the sidebar row keeps its Archive menu. The menu's Manage Sharing opens the same dialog the Share button does.
- Items gate on what the person may do, not on where they are: Copy Thread URL and Export only need the ability to read the thread; Manage Sharing and Rename need ownership, since `PATCH /threads/:id` is `thread: "own"`; Model and Reasoning appear only where a message can be sent (`owned || driven`), because the composer is their only consumer.
- Reasoning is a submenu only when the chosen model offers two or more levels, as the composer hides it otherwise.
- Model and Reasoning read and write `useModelSelection(thread.id, thread.agentBackend)`, so the composer's footer follows a choice made from the menu.
- The model submenu names each provider once, as a heading over its models, instead of repeating it on every row: the label then takes the row's whole width, with the full name on hover. Repeating the provider squeezed model ids such as `deepseek-v4.1-flash` into `deepse...`.
- Rename edits in place: `ThreadTitleField` replaces the title with a selected input, and `useRenameThread` saves it. The field is the same component the sidebar row uses, so both paths behave alike. The menu stops Base UI pulling focus back to its trigger (`finalFocus`), so the field keeps the focus it asked for.
- Export is `GET /threads/:id/export`, the thread's transcript as `text/markdown` (`threads/export.ts`). The client fetches it with `request()` from `@/lib/api` and downloads it as `<title-slug>.md` (`hooks/use-export-thread.ts`).

## Consequences

- Two ways to rename a thread: the sidebar row's title and the header's menu. Renaming from the header needs the thread open.
- The Markdown shape — a `# title`, then `## User` and `## Assistant` sections, reasoning in a `<details>` block, tools and attachments as bullets — is pinned by `threads/export.test.ts`; changing it changes a file people already have.
- A mark at rest is drawn in the theme's ink, so a thread's color shows while it works, and fades with the mark, in the sidebar row, the working row in the thread, the project page's thread list and a fork's card.
- Colors belong to the thread, not to the reader: a teammate opening a shared thread sees the owner's choice and cannot change it.
- A separate title color, next to this one, was tried and dropped: two swaps for one identity read as noise, so a thread has one color and its title and mark share it.
- Exporting reads the whole history before answering, so a very long thread exports slowly.
