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

- Numbers are per folder, start at `0001`, and are never reused or renumbered.
- Do not delete outdated docs. Mark them `Status: superseded by 000X`.
- Start each doc with a `# Title` and a `Status:` line.
