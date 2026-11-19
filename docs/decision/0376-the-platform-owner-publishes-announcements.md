# The platform owner publishes announcements

Status: accepted

## Context

The beta card is fixed in code. The platform owner wants to publish a notice without a release: pick a background, write a summary and details, and show it to everyone.

## Decision

An `announcements` table holds the title, summary, markdown details and a background template. Only the platform owner can create, edit or delete them. At most one is active: making one active turns the others off, in one transaction, and a unique index on the active row keeps it true when two owners publish at once. Every signed-in person reads the active one and sees it as a sidebar card that opens a dialog with the details. Dismissing is kept in the browser, by announcement id, so a new announcement shows again.

The backgrounds are the beta card's wave image and three hue-shifted copies in `apps/platform/public/announcements/`.

## Consequences

- A dismissed announcement returns on another browser. Moving it to the user's settings, as the beta card does, is a later step.
- The hardcoded beta card stays for now and can become the first announcement.
