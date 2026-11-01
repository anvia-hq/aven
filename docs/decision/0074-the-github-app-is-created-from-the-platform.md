# The GitHub App is created from the platform

Status: accepted. Extends 0013 (projects are GitHub repositories) and 0073 (install and update with a script).

## Context

A project is an imported repository (0013), so a fresh install could do nothing until someone created a GitHub App by hand, with the right permissions and callback URL, and put five values in `.env`. It was the last manual step after `install.sh`.

## Decision

- **A platform owner creates the app with GitHub's App Manifest flow.** Settings > Platform has a "Create GitHub App" button. The browser posts a manifest (the app's name, `url`, callback URL, `redirect_url`, `request_oauth_on_install`, and the permissions of 0041 and 0044: Contents and Pull requests read and write, Actions, Checks and Commit statuses read, Metadata read; no webhook) to `<GitHub>/settings/apps/new`, or to `organizations/<login>/settings/apps/new` when the app is to belong to an organization. GitHub sends the browser back to `<origin>/api/github/app/callback?code&state` and the server exchanges the code for the app's credentials (`POST /app-manifests/<code>/conversions`) and sends the person on to install it.
- **`GET /github/app/manifest`** (platform owners only) returns the manifest and where to post it; its `state` is signed with the secret of the other GitHub states and carries the person and the time, and the callback accepts it only for the same person within an hour. The callback needs the person's session and to be an owner as well.
- **The credentials are kept encrypted** (`encryptSecret`, the providers' key) in `platform_settings` under `github_app`, so no migration. **The environment wins**: when every `GITHUB_APP_*` variable is set, that app is used and the button is not offered. The credentials are loaded once at start and set on the client when they are saved (`GithubClient.configure`, which forgets the installation tokens it cached).
- **The app is private unless the owner says otherwise.** A private app can be installed only by the account or organization that owns it, which is why `v0.1.0`'s app could not be installed on a second organization. The Create button has a switch, off by default, "Allow installing on other accounts and organizations", which sends `public=true` to `GET /github/app/manifest` and puts `public: true` in the manifest. Settings says how to make an app that already exists public on GitHub (Advanced > Make public). A public app is not an exposure of Aven: installing it on an account attaches nothing without a `state` this server signed, and acting as the app needs its private key.
- Not done: webhooks (nothing here uses them), removing or replacing the stored app, changing an existing app's visibility from Aven.

## Consequences

- A self-hosted install needs no `.env` edit and no visit to GitHub's settings other than the two confirmations GitHub itself asks for.
- `PROVIDER_ENCRYPTION_KEY` now protects the app's private key and client secret too; losing it means creating the app again.
- Whoever holds the app's credentials can act as the app on every installation: they are readable by the server process only, and by nobody through the API.
