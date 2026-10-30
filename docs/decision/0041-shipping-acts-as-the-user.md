# Shipping acts as the person, with their GitHub token

Status: accepted. Supersedes the parts of 0040 that push with an installation token and open the pull request as the app; the rest of 0040 stands.

## Context

0040 pushed with a token the app minted for the repository and opened the pull request with the app's own token. GitHub then shows the pull request as opened by the Aven app's bot, and the person who shipped gets no credit for it. Their commits count on their profile only when the commit email is one GitHub links to them, and the email of an Aven account often is not.

## Decision

- **Pushes and pull requests are made with the person's GitHub user access token** (a GitHub App "user-to-server" token). GitHub shows the person as the author, with the app named beside them, and the person's own rights on the repository decide whether they may push: someone with read access cannot ship through the app.
- **The token is kept per user.** A new table `github_user_tokens` (one row per user, not per organization: a GitHub account is the person's) holds the token and its refresh token encrypted with `PROVIDER_ENCRYPTION_KEY`, the GitHub account's id and login, and when each expires. GitHub expires a user token after 8 hours: it is refreshed when used (the refresh token is single-use, so a refresh is done by one request at a time per user), and a refresh that GitHub refuses removes the row, which is the same as not being connected.
- **The person connects their GitHub account once.** The install callback already received the OAuth `code` and threw the token away after checking access; it now keeps it. A person who did not install the app connects at `GET /github/connect`, which sends the browser to GitHub's authorization page and comes back to the same callback with no `installation_id`. The signed `state` can carry a relative path to return to. Ship without a connected account is a 409, and the Ship button offers Connect GitHub instead.
- **Commits are by the person's GitHub account**: the name from their profile (else the login) and `<id>+<login>@users.noreply.github.com`, so the credit lands on them whatever email their Aven account has.
- **Two checks before the runner is asked**, each a 409 that says what to do: the installation must have been approved for `contents` and `pull_requests` write (`GET /app/installations/:id` lists its permissions), and the person must be able to push to the repository (`permissions.push` of `GET /repos/:owner/:name` with their token).
- **The app keeps needing `contents` and `pull_requests` write**: a user token has at most what the app and the person both have. The installation token is no longer used for writing, so the code that minted write tokens goes.
- **The token goes to the runner the way 0040 says**: handed with the one `repo.push` call, in git's environment, never stored there, never in the container.

## Consequences

- The pull request, and the push, are the person's on GitHub. Branch protections and required reviews apply to them as to anyone.
- Aven now keeps a long-lived GitHub credential per user (the refresh token, valid about six months), encrypted at rest. Losing `PROVIDER_ENCRYPTION_KEY` loses them; people connect again.
- A user token needs the app's "Expire user authorization tokens" setting on, which is GitHub's default for new apps; an app with it off gives tokens that do not expire, which are kept without a refresh token.
- A single control plane instance is assumed for the refresh lock.
