# Docs

Project knowledge lives here. Keep it short, current, and in the right folder.

## Layout

| Folder      | What goes in it                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `decision/` | Why we chose X over Y (ADRs): context, options, outcome, consequences.                                                                |
| `products/` | What we are building: features, specs, user flows.                                                                                    |
| `rules/`    | Conventions and constraints contributors (and agents) must follow.                                                                    |
| `bugs/`     | Bugs in third-party **libraries** we depend on, plus workarounds.                                                                     |
| `guides/`   | How to install, run and fix Aven, for the people who use it. The site's docs are made from these; they have plain names, not numbers. |

`bugs/` is not for our own bugs. Track those in the issue tracker.

## File format

`xxxx-name.md`: a zero-padded 4-digit sequence number, then a kebab-case name.

```
decision/0001-use-bun-workspaces.md
products/0001-onboarding-flow.md
rules/0001-typescript-strict.md
bugs/0001-somelib-crash-on-empty-input.md
```

- Numbers are per folder and start at `0001`. They run without gaps, except in `decision/`, where a number is never reused (0387).
- A doc that is no longer true (its bug is fixed upstream, or its workaround is gone) is deleted, and the folder renumbered. Fix the links to the docs that moved.
- Start each doc with a `# Title` and a `Status:` line. The number stays in the file name, not in the title (0387).
- `decision/` keeps its own rules (0154, 0387). A decision keeps its number and its `Status:` line when a later one supersedes it, because it still records what was decided and why; a number is never reused, so the folder may have gaps; and `decision/README.md` names every decision whose own `Status:` line says a later one superseded it, and what replaced it.
