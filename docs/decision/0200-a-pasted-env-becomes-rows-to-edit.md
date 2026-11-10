# 0200: A pasted .env becomes rows to edit

Status: accepted. Builds on 0045 (project variables and secrets) and 0046 (their scopes).

## Context

Pasting a `.env` into the Add a variable dialog showed one text box with the whole file, and below it a read-only list of what would be added. A person could not fix one value without editing the text, and a line with no value (`OPTIONAL_KEY=`) made saving fail when Secret was on: a secret needs a value (0045), the server refused the first such line, and the lines before it were already saved.

## Decision

- **A pasted `.env` becomes a row for each variable, a name and a value, each editable**, as in Vercel's dashboard (a paste into the key field makes the rows). A paste into a row's Name box fills in the rows from the text; into a blank row it takes that row's place, into a filled one it adds after it. A name that is pasted again keeps its newest value. The Paste a .env button opens the rows empty, to type or to paste into. A row can be removed and another added.
- **A row that cannot be saved says why under itself and stops the Add button**: a name that is not letters, digits and underscores, a reserved one (0045), a name used twice, a value that is too long. Lines of a paste that cannot be read stay listed as skipped, as before.
- **A row with no name is ignored. With Secret on, a row with no value is left out, and the row says so; with Secret off it is saved with an empty value.** The rest are saved, so one empty line cannot stop the others. The button counts only what will be saved.
- The server's rule that a secret needs a value is unchanged: the client no longer sends such a row.

## Consequences

- The rows are in the page only, as the text was; nothing is saved until Add.
- A single variable is still added with the plain Name and Value form, and edited with it.
- The secrets typed or pasted are in password boxes while Secret is on. Their names are always visible.
