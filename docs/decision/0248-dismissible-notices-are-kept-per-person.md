# Dismissible notices are kept per person in the database

Status: accepted.

## Context

Aven is in beta and says so in a card in the sidebar. A person who has read it should not see it again on another browser or device, so the browser's storage is not enough.

## Decision

- `user_settings.dismissed_notices` holds the ids of the notices a person dismissed. `GET /preferences` returns them and `POST /preferences/notices/:id/dismiss` adds one, once.
- The platform's `useNotice(id)` shows nothing until the list has loaded, so a dismissed card never flashes.
- The first notice is `beta`, in the sidebar above the machines. A new notice is a new id and a card; nothing else changes.
