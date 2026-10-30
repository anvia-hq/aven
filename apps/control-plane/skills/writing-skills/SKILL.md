---
name: writing-skills
description: Write or improve an agent skill (a folder with a SKILL.md). Use when the user asks for a new skill, wants to turn a workflow into one, or wants a skill in this repository's .aven/skills.
---

# Writing skills

A skill is a folder whose name is the skill's name, holding:

- `SKILL.md`: YAML frontmatter, then the instructions in Markdown.
- `references/` (optional): longer documents the instructions point to, read only when needed.
- `scripts/` (optional): programs the instructions tell the agent to run.

## Frontmatter

```yaml
---
name: release-notes
description: Draft release notes from the commits since the last tag. Use when the user asks for release notes or a changelog entry.
---
```

- `name`: lowercase letters, numbers and hyphens, at most 64 characters, the same as the folder's name.
- `description`: at most 1024 characters. It is all an agent sees before it opens the skill, so say what the skill does **and when to use it**.

## The instructions

- Write steps an agent can follow without asking: what to look at, what to run, what to produce, how to check it.
- Keep SKILL.md short. Move long material (API notes, style guides, examples) into `references/` and say when to read each file.
- Give each script a shebang line and say how to run it, with its arguments. Scripts run in the sandbox, from wherever the agent calls them.

## Where it goes

- For this repository: `.aven/skills/<name>/` in the workspace. Every thread of the project then has it.
- For the user alone: write the folder anywhere in the workspace and tell the user to upload it (as a folder or a zip) in Settings, Skills.

When it is written, check it with `scripts/check-skill.sh <folder>`, from this skill's folder.
