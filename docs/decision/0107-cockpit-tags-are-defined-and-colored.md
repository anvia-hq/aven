# Cockpit tags are defined and colored

Status: accepted. Adds to 0104 (tags are names on each record) and 0106 (a tag's color is picked by its name).

## Context

A tag was only a name on records: it existed while something carried it, and its color was the one of the bots' palette its name hashed to. The person wants a page of their tags where they add one before using it and choose its color.

## Decision

- **A tag may have a row of its own,** `cockpit_tags` (the person, the name, a color or null), unique by name per person. Records still carry tags by name in their `text[]`; the row only says what the records do not: that the tag exists before it is used, and its color. A person defines at most 200.
- **`GET /cockpit/tags`** lists every tag that is used or defined, with its counts and `color` (null for the one the name picks). **`POST /cockpit/tags`** adds one, refused with a 409 when the person has it already (in use or defined); **`PATCH /cockpit/tags/:name`** sets its color (`#rrggbb`) or with null gives back the default, making the row for a tag only in use.
- **The Tags page** (`/cockpit/tags`, in the cockpit's sidebar, `components/tags-page.tsx`) lists them, each with a swatch that opens the bots' twelve colors and Default color, its chip and what carries it, under a line that adds one. Every chip and the sidebar's tag icons draw a tag in its chosen color, else its name's (`hooks/use-tags.ts`'s `useTagColors`).

## Consequences

- Renaming and deleting a tag are not offered yet: both would change every record that carries it.
- A tag defined and never used stays in the list until such a delete exists.
