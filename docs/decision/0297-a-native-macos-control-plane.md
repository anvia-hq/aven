# 0297. A native macOS app mirrors the web control plane

Date: 2026-11-14

## Decision

`apps/macos` is a second native macOS app, Aven Desktop. It follows the web control plane's information architecture: the same rail (Threads, Cockpit, Bot, Settings), the same settings groups and page names, and the same control-plane HTTP API. `clients/macos` stays the thread client from decision 0008. The two apps do not share a Keychain service.

The package is split so the part that can be checked without a Mac is separate from the part that cannot:

- `AvenDesktopCore` is Foundation only: server address, bearer-token client, models, the transcript reducer, recency and project-board ordering, and the screen catalog. `swift test` in `apps/macos` runs on Linux.
- `AvenDesktop` is SwiftUI and AppKit. The package manifest includes that target only on macOS. It needs macOS 14.

No new backend. Email sign-in and invitation accept are native. GitHub sign-in and the GitHub App manifest stay in the browser, because they finish in a redirect this client cannot turn into a bearer token. The interactive terminal and the in-app preview stay out: both are a remote page or a binary socket, and this app is not a web view. The terminal panel wakes the computer; the browser panel opens the preview URL outside the app.

Cockpit documents are edited as plain text. The web app stores BlockNote JSON; the desktop shows that JSON as text and writes plain text back, which the web app still displays.

The app has no `package.json`, so `apps/*` does not make it a Bun workspace and the Dockerfiles do not copy one.
