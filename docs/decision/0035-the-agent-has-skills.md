# The agent has skills

Status: accepted. Builds on 0006 (user-scoped providers), 0010 (per-thread workspaces), 0012 (the agent's tools are the sandbox's), 0021 (durable runs) and 0034 (attachments mounted at /uploads).

## Context

A skill is a folder with a `SKILL.md` (YAML frontmatter with `name` and `description`, then instructions) and, optionally, `references/` and `scripts/`. It teaches the agent how to do one kind of task, and only costs context when the task comes up: the agent sees each skill's name and description, and reads the rest when it needs it.

`@anvia/core` reads and validates skill folders (`skill.local`) and can give an `Agent` skills (`loadSkills`), but the tools it adds for them (`get_skill_instructions`, `run_skill_script`, ...) read files and spawn scripts in the process that runs the agent. Here that is the runner, on its host, outside the sandbox. A script from a skill must run where everything else the agent runs does: in the thread's container.

## Decision

- **Three sources, merged by name.** _Built-in_ skills ship with the control plane (`apps/control-plane/skills/<name>/`). _Personal_ skills belong to a user, like providers (0006): they follow the user into every organization and every thread they send a message in. _Repository_ skills are the project's own, in `.aven/skills/<name>/` of the repository. When two have the same name, a repository skill beats a personal one, which beats a built-in one.
- **Personal skills are uploaded as a folder or a `.zip`.** The platform unpacks a zip in the browser (`fflate`), so the control plane only ever receives a list of files (`POST /skills`, base64, at most 200 files and 5 MB). It validates them with Anvia's `skill.local` in a temporary directory, packs the folder as a `.tar.gz` (`Bun.Archive`) and stores it in the `skills` table with its `digest`, a SHA-256 of the files and their paths (not of the archive, so the built-in skills, packed again at every start, keep theirs). A skill whose name is taken is replaced: uploading again is how a skill is updated. A personal skill can be switched off; built-in ones cannot.
- **The skills of a run travel by digest.** `run.start` and `run.resume` carry `skills: [{ name, description, digest }]`, the sender's enabled skills and the built-ins (wire version 14). The runner keeps every archive it has fetched under `<AVEN_RUNTIME_HOME>/skills/cache/`, and asks for one it does not have with the call `skills.get`, which the control plane answers only with a digest of that run.
- **In the sandbox, skills are files, read with `exec_command` (`cat`).** (`read_file` is confined to `/workspace` and cannot reach `/skills`; an early version of the instructions said to use it, and agents fell back to `cat` after an error.) Before a run, the runner fills `<AVEN_RUNTIME_HOME>/skills/threads/<thread id>/` with the run's skills, and every container of the thread mounts it read-only at `/skills`. Repository skills are read where they are, in `/workspace/.aven/skills`. The agent is not given Anvia's skill tools: its instructions list each skill's name, description and `SKILL.md` path, and say to read one with `read_file` when it fits the task and to run its scripts with `exec_command`.
- **A repository skill is read only inside the workspace**: a SKILL.md whose real path is outside it (a symlink) is left out, as the Files panel confines reads (0031).
- **A skill that does not validate is left out** of the run, with a warning in the runner's log, instead of failing it. This matters for repository skills, which nobody checked before the run.
- **The run's record keeps its skill list** (`RunRecord.skillListing`), so a run taken up after a restart has the same instructions. `AGENT_VERSION` is 2.

## Consequences

- A thread's container from before this change has no `/skills`; it gets one when it next starts.
- Skills are trusted the way the user's own messages are: anything in them is something the agent may do in the sandbox. A repository skill is as trusted as the repository.
- Archives cached by a runner are never deleted yet, like uploads and artifacts.
- The skill list changes per run, so the instructions of two runs of one thread may differ; the history does not depend on them.
