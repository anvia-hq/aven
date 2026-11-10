# The user menu starts with the person

Status: accepted.

## Context

The user menu opened with the organization: its name, a member count and a wide Settings button, followed by Personal settings. Two items were called Settings with the same gear icon, the wide button read as the main action, and a divider followed every row.

## Decision

- The menu opens with the person: photo, name and email.
- The organization is one compact row with its own gear. It is a single item, "Organization settings", that opens the members settings. A person with more than one organization still sees the list to switch between them.
- Personal settings (with a person icon) and Command palette follow, then Sign out in the destructive style. Dividers sit only between groups.
- The organization badge uses a tint of the primary colour, since the repository allows theme colours only.

## Consequences

- Each thing has one Settings, and the menu says whose it is.
- The email is read from the session user, so the shell's user type carries an optional email.
