# Aven Desktop

Native macOS control plane. SwiftUI and AppKit, the same screens and the same HTTP API as the web app in `apps/platform`. It is not a web view, and it does not replace the thread client in `clients/macos`.

Decision 0297. The API and email session are the ones in `docs/products/0004-native-client-contract.md`.

## Requirements

- macOS 14 or later
- Xcode 15 or later (Swift 5.9+; the package is Swift tools 6.0)
- A running Aven control plane (local default `localhost:8000`)

This repository's Linux agents can type-check `AvenDesktopCore` with a Linux Swift toolchain. They cannot build the SwiftUI app: that target exists only when the package is evaluated on macOS, and `xcodebuild` is not available here.

## Build and run

Open `apps/macos/Package.swift` in Xcode and run the `AvenDesktop` scheme.

From a Mac with the Swift toolchain:

```sh
cd apps/macos
swift run AvenDesktop
```

Core tests, including on Linux:

```sh
cd apps/macos
swift test
```

The first window asks for the server, then email and password. The session token is stored in the Keychain under `dev.anvia.aven.desktop`, separate from the other macOS client.

Server address:

- `localhost:8000` and `127.0.0.1` stay on that origin, with `http` when no scheme is typed.
- A hosted host with no port and no path gets `/api` appended (`https://aven.example.com` becomes `https://aven.example.com/api`).

⌘, opens the macOS Settings window (server address and appearance on this Mac). Workspace settings inside the app are ⌘⇧,. ⌘N starts a thread, ⌘K searches, and ⌘1 ⌘2 ⌘3 switch Threads, Cockpit and Bot.

## Screens

The rail order matches the web app: Threads, Cockpit, Bot, Settings. Machines sit in the sidebar footer.

| Screen                               | In this app                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in, register, accept invitation | Email and password, plus an invitation id. The server's registration and email-login flags are honored.                                                 |
| New thread                           | Project, provider, model, effort, prompt.                                                                                                               |
| Thread                               | Live event stream, composer, stop, one question at a time, share and multiplayer, archive, ship when the server says the repo is ready.                 |
| Thread panels                        | Overview (environment, usage, background processes), Files (path list), Changes (unified patch), Terminal (wake only), Browser (opens the preview URL). |
| Projects                             | All / Mine / Working, runner filter, add folder or repository, project page with files, README, about, threads, variables, commits, pulls, issues.      |
| Cockpit                              | Inbox, tasks (board and table), notes, tags, pinned notes, tag filter.                                                                                  |
| Bot                                  | Main bot and the others, chat over the bot event stream, name, description, instruction, model.                                                         |
| Settings, Personal                   | General, Profile, Providers, Claude Subscription, Bots, Skills, MCP servers, MCP access, Webhooks, Memory, Environment variables.                       |
| Settings, Workspace                  | Members, GitHub, Runtimes, Variables, Decision model.                                                                                                   |
| Settings, Platform                   | Platform, People, Announcements. Shown only when `GET /platform/config` says `isOwner`.                                                                 |
| Command palette                      | Threads, projects and settings (⌘K).                                                                                                                    |
| Mentions                             | `@` menu, mark all read.                                                                                                                                |
| Announcements                        | Sidebar card, details sheet, dismissed on this Mac.                                                                                                     |

## Deviations from the web control plane

- GitHub sign-in is not completed in the app. A server with only GitHub login explains that. Connecting GitHub uses the install URL in the browser. Creating a GitHub App from the manifest stays in the browser.
- No embedded browser and no interactive terminal. The preview opens in the system browser. The terminal panel wakes the thread's computer and says an interactive shell is not in this app.
- Cockpit bodies are plain text. BlockNote JSON from the web app is shown as its text. Saving writes plain text, which the web app still shows.
- Files are a path list, not a tree with syntax coloring. Changes are the unified patch and a line count, not a split highlighted diff.
- Ship uses the readiness flag: if the repository is not set up, the app sends the setup message; otherwise it ships, as an update when the thread already has an open pull request. The web bar's full state machine (branch pull requests, connect-GitHub, actions from `.aven/actions.yml`) is not repeated control for control.
- Thread and bot composers do not attach files, mention paths or skills, or draw markdown, artifacts, subagent cards or bot-to-bot lines. Questions are one at a time, as on the web.
- Profile is the counts from `GET /profile/stats`, not the year heatmap or the token chart.
- Appearance on this Mac is light, dark or system, plus one interface text size and a sounds switch. The web palettes, heading fonts and separate thread and bot text sizes are not here.
- Follow-up suggestions can be switched on. The app does not draw the suggestion chips, and saving preferences keeps the model already chosen.
- A skill is uploaded as a folder (up to 40 files, 512 KB each), not a zip unpacked in the browser.
- The app polls the lists every few seconds. It does not play the web app's finish chime.
