# The computer sits under the folder or repository tabs, and the footer names the target

Status: accepted. Changes only the layout of the Add a project dialog; what a project is and how it is added stays as it was.

## Context

The Add a project dialog had the computer as a full-width select with its own label, placed above the folder list or the repository field. Both were boxes of the same weight, so the select read as a second list stacked on the first, and it was not clear which one the folder list belonged to. The footer only said "Add", so nothing there showed where the project would be added.

## Decision

- **The computer is one row directly under the Folder / Repository tabs**: a `Computer` label on the left and the select on the right, above the folder list or the repository field. The tabs choose what is added; the row beneath says where it is added.
- **The footer names the target.** It shows what the Add button will do: `<computer>: <path>` for a folder, `Clone <repository> to <computer>` for a repository, or `No folder chosen yet` / `No repository yet` when nothing is chosen. The text is built by `useAddProject` (`footerNote`), so the dialog only renders it.
- **A chosen folder is marked by its background alone.** The folder picker drops the inset rule on its left edge and keeps the tinted row.
- **The folder list is a little shorter** (`h-48`, from `h-56`), so the computer row fits without the dialog growing.

## Consequences

- The select keeps its `aria-label="Computer"`, so the accessible name and the e2e tests that find it by label still hold.
- The footer text is a summary, not a control. It cannot be used to change the target; the select above it is the only place to do that.
- The close button is the dialog's own (`showCloseButton`), so it is not part of this decision.
