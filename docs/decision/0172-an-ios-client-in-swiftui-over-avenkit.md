# An iOS client in SwiftUI over AvenKit

Status: accepted. Follows decision 0008 (native clients over the control plane's API).

## Decision

- `clients/ios/AvenMobile` is a SwiftUI iPhone and iPad app (iOS 17) that uses `AvenKit` from `clients/macos` as it is, with `.iOS(.v17)` added to that package's platforms. Its project file is `project.yml` for XcodeGen (`xcodegen generate`, the `.xcodeproj` is not committed), since a Swift Playgrounds-style package builds an app only from Xcode's own window and `xcodebuild` cannot make one.
- It is a boilerplate: sign in or create an account, then the list of the person's threads with a running mark, refreshed every five seconds. It has no thread view yet.
- It has one theme, Mint dark (decision 0155), forced with `preferredColorScheme(.dark)` and `UIUserInterfaceStyle`: `Theme.swift` holds the web app's oklch tokens as sRGB.
- A server typed without a port or path that is not local is the platform's address, whose API is under `/api` (Caddy proxies `/api/*` to the server with the prefix stripped); `APIClient.normalize` adds it. `localhost:8000` and an address with a port or a path stay as typed.

## Consequences

- The macOS client gets the same address handling, since both use `AvenKit`.
- The app needs full Xcode. `UITests/SignInTests.swift` signs in against a running control plane (`TEST_RUNNER_AVEN_TEST_SERVER`, `_EMAIL`, `_PASSWORD`) and expects the thread list.
