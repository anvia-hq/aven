# The runner's git reads its own configuration, not the workspace's

Status: accepted. Changes how decisions 0030, 0036, 0042 and 0043 run git on the runner's host; what they do is unchanged.

## Context

A thread's workspace, `.git` included, is mounted read-write into its container, so the agent can write the repository's configuration, hooks and attributes. The runner also runs git on its own host, outside the container, against the same `.git`: marking a turn and making a thread's diff (decision 0030), listing files for the composer's `@` (0036), fetching a branch (0042) and bringing a restored workspace up to date (0043). Git runs programs its configuration names: a filter's `clean` on `git add`, its `smudge` on a checkout, a diff driver's `textconv`, hooks (`reference-transaction` runs on `update-ref`), `core.fsmonitor`, `gpg.program` when `commit.gpgSign` is set (even for `commit-tree`), and URL rewrites to other transports. Marking a turn ran `git add --all` at the start of every run, so a filter the agent planted ran on the runner's machine.

`host-git.ts` already switched off hooks, the file system monitor, credential helpers and maintenance with `-c` for the fetch and the restore. That cannot cover filters and diff drivers: their names (`filter.<name>.clean`) are the agent's to pick, and git has no switch for ignoring a repository's own configuration. Reading the names first and switching each off races an agent that can rewrite the file in between.

## Decision

- **Every git command the runner runs on a workspace goes through `hostGit`.** It points git at a directory of the runner's own (`GIT_DIR`, in the system's temporary folder, removed afterwards) whose configuration the runner writes. The configuration copies only the keys that describe the repository (`core.repositoryformatversion`, `filemode`, `symlinks`, `ignorecase`, `precomposeunicode`, `logallrefupdates`, and `extensions.*`), and only plain values. There are no hooks and no `info/attributes`; `info/exclude` is copied, so ignored files stay ignored.
- **The rest of `.git` is linked.** Objects, refs, `packed-refs` and logs are symbolic links to the workspace's, so what git writes lands in the workspace as before. HEAD is copied in and written back when git moved it, since git takes a linked HEAD for no repository. A file git replaced by renaming over its link is moved back. The index is the workspace's (`GIT_INDEX_FILE`) unless the command names a scratch one.
- **An attribute that names a driver this configuration lacks does nothing.** So `.gitattributes` and filters are harmless without anything being switched off by name. The `-c` switches stay as a second line, with `commit.gpgSign=false` added, and the diff also passes `--no-textconv`.
- **A `.git` that is a link, has no HEAD, or has `commondir` or `gitdir` is not a repository.** Such a file would send git to a configuration elsewhere. The runner's own clones never have one.
- **What writes the workspace's configuration on purpose still uses plain git**: the clone itself, before the agent has the workspace, and `trackPushes`, which adds a fetch refspec for the agent's own git. Writing configuration with `git config` runs nothing.

## Consequences

- Each host git command creates and removes a small directory and runs `git config --list` once more. The cost is a few milliseconds per command.
- `host-git.test.ts` plants each of these and checks that nothing ran: a filter in `.gitattributes` and in `info/attributes`, a textconv, a hook, a signing program, and a file system monitor.
- Not covered: the agent can still replace a directory inside `.git`, such as `refs`, with a link out of the workspace while a host command runs. Git would then write a ref (a commit id) there. That lets the agent write a short file on the host, not run a program; it is left for a later decision.
