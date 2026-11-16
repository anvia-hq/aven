# 0321. The Codex agent runs on a ChatGPT device sign-in

Status: accepted. Supersedes the credential of 0298 (an OpenAI API key).

## Context

0298 ran the Codex agent on an OpenAI API key, which bills the API and never uses the person's Codex plan. The goal of the `codex-subscription` provider is the plan, so its credential has to be a ChatGPT sign-in.

## Decision

The goal of the `codex-subscription` provider is to use the person's Codex (ChatGPT) plan, not API billing. The person signs in with the same device-code flow as `codex login --device-auth`, from Settings > Providers:

1. `POST /providers/codex-device` asks `auth.openai.com/api/accounts/deviceauth/usercode` (Codex's client id) and returns a one-time code and `https://auth.openai.com/codex/device`.
2. The dialog shows both. The person opens the link, signs in to ChatGPT and enters the code.
3. The dialog polls `POST /providers/codex-device/poll` at the given interval. The control plane asks `deviceauth/token` once per poll; 403/404 means still pending. On approval it exchanges the authorization code at `/oauth/token` (PKCE verifier from the answer, redirect `/deviceauth/callback`), builds the same `auth.json` the CLI writes, and saves it encrypted: a new `codex-subscription` row, or the existing one when `providerId` is given. The tokens never reach the browser.

The stored credential is that `auth.json` text. The key hint is the last four characters of the refresh token. Pasting an `auth.json` through the API is still accepted.

On the runner, a JSON credential is written to `CODEX_HOME/auth.json` (mode 0600) and `CODEX_API_KEY` is not set. Its tokens are redacted from output. A row that still holds a plain `sk-` key keeps working through `CODEX_API_KEY`.

## Refreshed tokens

Codex refreshes the access token itself and the refresh token can rotate. After each turn (and when the run ends) the Codex backend reads `CODEX_HOME/auth.json`. When its tokens changed it uses them for the next turn and the runner calls `codex.auth` on the control plane with the previous and the new file. The control plane finds the `codex-subscription` row whose saved refresh token equals the previous one, checks the account id is the same, and replaces the credential only if the row has not changed meanwhile. A call that matches no row is ignored. A failed call is logged on the runner; the next run then starts from the saved sign-in.

The tokens of a refreshed file join the run's redaction list when they are adopted.

## Consequences

- A person connects Codex with a code and a link; there is no key to paste in the app.
- The control plane holds a long-lived refresh token per person, encrypted like every provider credential, and follows its rotation through `codex.auth`.
- The device endpoints and the client id belong to OpenAI's Codex CLI, not a public contract: a change there breaks the sign-in until this is updated.
- A rotation that happens while the runner is offline is lost, and the person signs in again.
