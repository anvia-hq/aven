# A skill is installed from a link, not only uploaded

Status: accepted. Builds on 0035 (the agent has skills).

## Context

Settings > Skills takes a skill as a folder or a `.zip` of one, which the platform unpacks in the browser and posts as a list of files (0035). The open skills directory, skills.sh, hands a skill out with a CLI of its own, `npx skills add owner/repo`: it needs Node on the machine it runs on and asks its own questions in a terminal, which neither the web app nor a thread's cloud sandbox has. What a skills.sh page names, though, is a GitHub repository and a folder of it, and GitHub serves that as an API any server can read.

## Decision

- **Settings > Skills installs a skill from a link**, beside the upload: `owner/repo`, `owner/repo@skill`, a `github.com` link to the repository or to the folder or `SKILL.md` inside it, a `skills.sh` link to a skill, and the `git@github.com:` form. `install.ts`'s `parseSkillSource` reads one into an owner, repository, ref, folder and skill name.
- **The control plane reads it from the GitHub API.** One request lists the repository's tree at the link's ref (or `HEAD`) with `?recursive=1`, and each file of the chosen folder is read by its blob sha, up to the limits an upload has (200 files, 5 MB). Nothing is cloned and no Node is needed. The server only ever fetches `api.github.com`, never an address the person typed, so this opens no way to a private one.
- **A repository of several skills asks which one**, returning the names for the page to offer as buttons. A link that names one (after an `@`, a folder, a skill's own skills.sh page) goes straight in.
- **Installing is the upload from the other end**: the same `packSkill` validates the files and names the `.tar.gz` by its digest, and the same upsert saves it, so a name that is taken is replaced, and every limit, message and switch holds for both.
- **A person who connected GitHub installs from their private repositories too**: the tree and blob reads carry their own token, and a person who has not connected GitHub gets an anonymous read.
- **A skills.sh pack is not an install**: `skills.sh/p/<id>` resolves through skills.sh's own API and not GitHub's, so its link says to install one of its skills from that skill's page.

## Consequences

- A skill installed from a link does not follow the repository: installing it again is how it is updated, and nothing records where it came from. An updatable skill wants the skill's source kept and a refresh of it, which is a later change and not this one.
- An anonymous read is at most 60 requests an hour for the server's address, a few installs of a few files. A rate-limited install says so, and a connected GitHub account is not held to the same limit.
- A folder on a person's own computer is still uploaded and never installed from its path: the control plane is not that computer.
- A `SKILL.md` the repository stores as a symlink does not count, as a repository skill's own symlink does not (0035), so such a folder is not offered.
