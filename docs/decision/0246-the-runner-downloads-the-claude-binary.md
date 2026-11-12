# The runner downloads the Claude binary on first use

Status: accepted. Fixes 0242 on an installed runner.

## Context

The Claude Agent SDK starts Claude Code, a 342 MB native program that ships as a separate npm package per platform (`@anthropic-ai/claude-agent-sdk-linux-x64`). The SDK finds it in `node_modules` beside itself. The `aven` that a machine installs is one compiled file with no `node_modules`, so every Claude thread on an installed runner failed with "Native CLI binary for linux-x64 not found". Tests missed it: they run from source, and the end-to-end spec answers from `AVEN_CLAUDE_FAKE`.

The SDK's licence is "all rights reserved", so bundling the binary into Aven's MIT release archives is not an option.

## Decision

- **The runner downloads the platform's package from the npm registry the first time a Claude thread starts**, into `claude-code/<version>/claude` under its home, and gives the SDK that path as `pathToClaudeCodeExecutable`. Later threads reuse it.
- **The download is checked.** `claude-binary-manifest.ts` pins each platform's package, version and sha512, copied from `bun.lock`. A file that does not match is refused and deleted. A test fails when the manifest and `bun.lock` disagree, so an SDK upgrade cannot leave a stale one.
- **A binary installed beside the SDK is used as it is**, so development from source downloads nothing.
- **One download serves threads that start together.** Another version's folder is removed after a download, so an SDK upgrade replaces the old copy.
- **The platforms are macOS and Linux, on x64 and arm64, with glibc or musl.** Any other is refused by name.
- **The release build runs the real download** on its Linux runner (`AVEN_CLAUDE_DOWNLOAD_TEST=1`): it fetches, checks and runs `claude --version`, so a broken download fails the release before it publishes.

## Consequences

- The first Claude thread on a machine waits for the download, about 340 MB unpacked, and needs access to registry.npmjs.org. A machine that cannot reach it cannot run Claude threads, and the thread says so.
- The runner keeps about 340 MB for the current version.
- The runner does not download when it starts, only when a Claude thread does, so a machine that never runs one is unaffected.
