# Ship is not shown until the repository is set up

Status: accepted. Supersedes the disabled button of decision 0083.

## Context

Decision 0083 kept the Ship button on screen but disabled, with a tooltip naming `/setup-env` and `/setup-ship`, until the repository had its environment script and its way of shipping. A grey button that cannot be pressed, on every thread of every repository that is not set up, reads as something broken.

## Decision

The Ship button, and Connect GitHub to ship, are not drawn until the thread's repository is set up to ship, and not while that is being checked. A thread that already has a pull request keeps the link to it. When the runner cannot say whether the repository is set up (it is offline), the button is still shown disabled with the reason, as before. `/setup-env` and `/setup-ship` stay available in the composer's `/` menu.

## Consequences

Nothing on screen says why Ship is missing; the commands are in the skills menu and in the product docs. The button appears once the thread has both files.
