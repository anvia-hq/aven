# A thread row has one actions menu

Status: accepted.

## Context

A sidebar thread row showed a Move to folder icon and an Archive icon on hover. Together with the time label, the crowd avatars and the host tooltip they crowded the right edge and overlapped.

## Decision

- A row shows one three-dots button on the right. Its menu holds Move to folder (a submenu of folders, New folder and Remove from folder) and Archive.
- The button shows on hover and on keyboard focus, and stays shown while its menu is open.
- The row keeps the room for one icon, not two.

## Consequences

- Archiving takes two clicks instead of one.
- A new row action goes into the menu and needs no new icon on the row.
