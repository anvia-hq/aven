# A setup script can write in the workspace

Status: accepted. Fixes a gap in 0043 (a repository sets its environment up) and 0095 (a Linux runner starts the container as the host user).

## Context

`.aven/setup` runs in a setup container as the image's user (`node`, uid 1000), while the workspace it is mounted on belongs to the host user, whose uid on a Linux runner is usually not 1000. A script that writes in `/workspace`, as every install does (`node_modules`), failed with `EACCES: permission denied, mkdir '/workspace/node_modules'` (pnpm) or `failed to create './node_modules/.bun'` (bun). On the homelab runner (uid 1002) three repositories' setups failed that way, so their threads started with no environment. A runner whose host user is uid 1000 never showed it, and neither does macOS.

## Decision

When the runner has a host user, it lends the workspace to the image's user (`chown -R node`) just before the script and hands it back to the host user (`chown -R <uid:gid>`) right after, whether the script worked or not, before the failure is reported. The thread's own container is unchanged: it runs as the host user.

## Consequences

A setup that installs dependencies works on a runner of any uid. Two `chown -R` of the workspace more per setup, which is once per repository and image.
