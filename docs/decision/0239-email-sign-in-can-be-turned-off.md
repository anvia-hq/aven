# Email sign-in can be turned off

Status: accepted. Extends 0235 (people can sign in with GitHub).

## Context

Sign-in was email and password, and with 0235 also GitHub. A hosted install that wants everyone on GitHub has no way to close the email routes: hiding the form is not enough, since the sign-up and sign-in endpoints would still answer.

## Decision

- **`AVEN_EMAIL_LOGIN=off` turns email and password sign-in off**: Better Auth's `emailAndPassword` is disabled, so its sign-up and sign-in routes refuse, not only the page. Anything else, or unset, leaves it on, so an existing install and the tests behave as before.
- **The server will not start with it off unless GitHub sign-in is on** (`GITHUB_LOGIN_CLIENT_ID` and `GITHUB_LOGIN_CLIENT_SECRET`), since nobody could otherwise sign in.
- **`/platform/config` says `emailLogin`.** The sign-in and register pages show the email form only when it is true and the GitHub button only when `githubLogin` is; the "or" between them shows only when both are.
- **An account made with email and password keeps its row but cannot sign in** while it is off. An install turning it off should have its people on GitHub first.

## Consequences

- With email off, an invitation link and a sign-up go through GitHub only.
- Turning it back on restores the email accounts that exist.
- A person with no GitHub account cannot join an install that has it off.
