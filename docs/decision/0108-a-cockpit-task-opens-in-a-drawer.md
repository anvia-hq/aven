# A cockpit task opens in a drawer

Status: accepted. Replaces the task dialog of 0104 and 0105; follows the page layout of 0106.

## Context

A task opened and was made in a centred dialog: a form of labelled fields, a bordered editor and a Save button. Beside the inbox and notes, laid out as Notion pages (0106), it read as a form. The person asked for the drawer from the right instead.

## Decision

- **A task opens in a drawer from the right** (`components/drawer.tsx`, swiped away to the right), as wide as 44rem, all the screen on a phone, over the board or the table, which stay where they were (`components/task-drawer.tsx`, `TaskDrawer`).
- **Inside, it is a cockpit page** (`DocumentPage`): a breadcrumb (`Tasks / T-3`) with the actions and a Close button, the title, the task's properties as quiet rows (Status, Priority, Due, Tags) and the description.
- **A task there is saves as it is changed**, as a note does: the title and description as typed, the rest at once; Delete task is in the `…` menu. **A task being started is a draft**, as a new inbox item is: Create task (or ⌘/Ctrl+Enter) makes it, Cancel or closing the drawer drops it.

## Consequences

- There is no Save button and no confirmation on closing an open task: nothing is waiting to be saved once the typing stops. Closing a new task with something written drops it.
