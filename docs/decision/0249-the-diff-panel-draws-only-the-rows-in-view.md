# The diff panel draws only the rows in view

Status: accepted.

## Context

The Changes panel made one DOM node per diff line and one card per file, so a diff of tens of thousands of lines froze the page. While a run was live the panel re-read the diff every four seconds, parsed it again and gave every file a new object, so every card re-rendered and every file was highlighted again.

## Decision

- **One virtual list.** The panel flattens the files into one list (file header, hunk header, one item per row, or per left/right pair in split) and draws only the items near the viewport with `@tanstack/react-virtual`. Heights are measured, so split rows that wrap stay correct.
- **A closed file contributes only its header.** A file of more than 400 changed lines still starts closed.
- **Highlighting follows the viewport.** Only files that have rows in view are highlighted, once each, and the result is kept for as long as the file is the same object.
- **A poll that changes nothing changes nothing.** The patch is parsed again only when its text differs, and a file that is the same as before keeps its object, so unchanged files are not drawn or highlighted again.
- **Unified keeps its horizontal scroll** by giving the list the width of the widest line (in `ch`).
- The Center's pull request files keep `DiffFileCard`: they are not live and are small.

## Consequences

The cost of the panel follows what is on screen, not the size of the diff. Browser find does not see rows that are not drawn.
