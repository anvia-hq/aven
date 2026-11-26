# iOS signs in by QR pairing

Status: accepted. Refines 0175 (an iOS client in SwiftUI over AvenKit).

## Context

The iOS app initially carried an email-and-password sign-in form plus a server address field (0175). Typing a self-hosted server address and credentials on a phone is tedious, and deployments running with `AVEN_EMAIL_LOGIN=off` (GitHub sign-in only) cannot sign in with email and password at all. People already sign in to Aven on the web, where Better Auth issues the session.

## Decision

- **iOS sign-in is QR pairing only**: the email/password form and server field in `clients/ios/AvenMobile/Sources/LoginView.swift` are replaced with an `AVFoundation` QR scanner, paired with an `aven://pair` custom URL scheme (`.onOpenURL`) and a secondary "Paste pairing link" sheet for the iOS Simulator or devices without camera access.
- **Short-lived, single-use pairing codes** live in the control plane's `mobile-pair` module (`apps/control-plane/src/modules/mobile-pair/`):
  - `POST /mobile-pair` (authenticated with `auth` and `org`) generates a 32-byte random code, stores its SHA-256 hash in `verifications` under `mobile-pair:<hash>` with the user and active organization for 2 minutes, and returns `{ code, expiresAt }`.
  - `POST /mobile-pair/exchange` atomically consumes the row (`DELETE ... WHERE identifier = ... AND expires_at > now() RETURNING *`), verifies the user and organization membership, inserts a new 30-day session into `sessions`, and returns `{ token, expiresAt }` along with the `set-auth-token` header.
- **Settings > Profile on the web** (`MobileLinkDialog`) generates the code on open, renders `aven://pair?server=<origin>/api&code=<code>` as an SVG QR code (via `uqr`) on a high-contrast light surface using semantic tokens (`data-theme="aven"`), shows a live expiry countdown, and offers Copy link / New code actions.
- **`AvenKit`** owns `PairingPayload.parse`, `APIClient.exchangePairingCode`, and `APIClient.signOut` so URL validation and exchange logic are unit-tested with Swift Testing.
- **Default Aven dark theme**: `clients/ios/AvenMobile/Sources/Theme.swift` and the asset catalog (`AccentColor`, `LaunchBackground`) switch from the old Mint dark tokens to Aven's default dark theme from `apps/platform/src/index.css` (`.dark`).

## Consequences

- Mobile gets its own independent session in `sessions`: signing out on the web does not sign out the phone, and signing out on the phone revokes only the phone's session.
- Because the QR carries `<origin>/api`, scanning works identically against production (Caddy `/api/*`), local Vite dev, and LAN dev servers without manual URL entry.
- The pairing code never embeds a reusable session token; a leaked screenshot expires after 2 minutes and cannot be replayed once scanned.
- `clients/ios/AvenMobile` requires `NSCameraUsageDescription` and the `aven` URL scheme in `project.yml`, and `UITests/SignInTests.swift` now signs in through the pairing link sheet (`TEST_RUNNER_AVEN_TEST_PAIRING_URL`).
