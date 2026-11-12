# People can sign in with GitHub

Status: accepted.

## Context

Sign-in was email and password only. A hosted install, and any install used by people who already live on GitHub, wants "Continue with GitHub". Better Auth already stores provider accounts in `accounts`.

## Decision

- **GitHub sign-in is on when `GITHUB_LOGIN_CLIENT_ID` and `GITHUB_LOGIN_CLIENT_SECRET` are both set**, and off otherwise, so an install without them is unchanged. It uses its own OAuth app, not the GitHub App of 0013 and 0074: that app is created from the platform after the first account exists, and can be a workspace's own (0123).
- **The callback is `<BETTER_AUTH_URL>/api/auth/callback/github`**, through the platform's `/api` proxy like every other call.
- **The sign-in and register pages show the button when `/platform/config` says `githubLogin`.** The server decides; the page never reads the variables.
- **Registration rules still apply**: the new-user hook that closes registration (0002) runs for a GitHub account too, and an invitation link carries through to `/accept-invitation/<id>`.
- **Signing in with GitHub does not connect the person's GitHub for runs.** That stays the connection of 0044 and 0192, made from the platform, so a person's runs never act with a login that was not given for that.

## Consequences

- A person who signs in with GitHub and has an email account with the same verified email is linked to it by Better Auth.
- A closed registration shows a failed GitHub sign-in as a return to the sign-in page.
- Connecting GitHub for runs is a second step; joining the two is a later decision.
