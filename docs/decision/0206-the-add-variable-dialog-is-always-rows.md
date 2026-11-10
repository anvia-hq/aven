# The add variable dialog is always rows

Status: accepted. Replaces the Paste a .env button and the single Name and Value fields of 0200.

## Context

0200 made a pasted `.env` into rows, but the dialog still opened with one Name and one Value field and a Paste a .env button that switched to rows. The person had to know about the button, or paste into the Name field, and the dialog was narrow for a row of a name and a value.

## Decision

- Adding a variable always shows rows, starting with one empty row. There is no single-field mode and no Paste a .env button; a paste into any Name box fills in the rows, as 0200 says.
- The dialog is wider (`sm:max-w-2xl`).
- The button says Add variable for one row and Add N variables for more.
- Editing one variable keeps its Name and Value fields: its name cannot change, and a secret asks for its value again.

## Consequences

- A person can paste a whole `.env` the moment the dialog opens, and add one variable by filling the first row.
- A reserved name is now shown under its row and stops the Add button, where before the server's refusal came as a toast.
