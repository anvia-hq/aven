# The platform owner cleans up Docker leftovers

Status: superseded by 0219 (the container sandbox, Desktop, Browser and snapshots are retired). Was: accepted. Follows 0165 (the platform owner's People page) and 0160 (archived threads are swept after a day).

## Context

A runner's machine fills with Docker leftovers that nothing frees at once: stopped sandbox containers, environment snapshot images (`aven-env-*`, 10 GB or more each on a real install) after their 72 hours or once no thread pins them, the sandbox image of each older release, and untagged images. The hourly sweep removes expired snapshots only for archived threads, and the rest waited for someone to `ssh` in and run `docker` by hand.

## Decision

- Settings > Docker, under Platform, is for platform owners. It lists each runner of the installation with what Aven left on its machine, and removes one item or everything listed for a runner behind a confirmation.
- What counts is Aven's own and nothing else: containers labeled `aven.sandbox` or `aven.setup` and carrying this runner's `aven.runner` label (or none, as `removeStale` treats them) that are not running, or are running for a thread this runner is not using; images that are untagged, `aven-env-*` that no thread pins and no snapshot younger than 72 hours names, and tags of the sandbox image other than the one the runner uses. An image a kept container runs on is never listed. Another runner's containers, other people's images and anything else on the machine are left alone (`runtime-client/src/leftovers.ts`).
- Two calls, `docker.leftovers` and `docker.remove`, answered by the runner. A removal only removes what the runner lists at that moment: a reference that is no longer a leftover is refused, so a stale page cannot delete a container that came back into use. Containers are removed first, then images.
- Calls are routed to a runner through `GET /platform/leftovers` and `POST /platform/leftovers/:id/remove`, owner only (`platform/leftovers.ts`).
- No wire version bump: the calls are new, and a runner that does not know them fails with an error, which the page shows as "run aven update on its machine". Bumping would have cut off every older runner for a page they do not need.

## Consequences

- Removing an image Aven needs again costs a pull or a rebuild at the next thread that asks for it. Removing a container a person was about to use cannot happen for a running one that a thread uses.
- A removal runs `docker rm -f` and `docker rmi` one item at a time, so one stuck item does not stop the others; failures are reported with Docker's own reason.
- It is a manual button. An automatic sweep of the same list is a separate decision.
