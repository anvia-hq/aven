# One control plane, many runtimes, many clients

Status: accepted and built, except that the macOS app's SwiftUI layer (`clients/macos/AvenMac`) is written but not compiled: it needs full Xcode, which the machine it was written on lacks. Its library (`AvenKit`) is built and tested, including against a live server. Builds on 0004 (server-owned runs, SSE). Changes where 0003 (agent execution), 0005 (project paths) and 0006 (provider keys) apply: they keep holding for the control plane, and the agent side moves to runtimes.

## Context

Today the control plane is also the runtime. It runs the agent loop in-process, owns the filesystem the agent edits (a project is an absolute path on its disk) and runs the unsandboxed shell. The goal is a single control plane that users can attach their own machines to, and several clients: the web app, and a native macOS app (Swift, Xcode, no web view and no iframe).

## Decision

- **Three parts.** The control plane holds auth, organizations, providers and keys, threads, transcripts, the runtime registry and run routing. A **runtime** is a separate process on any machine; it runs the agent loop, tools, `JobRegistry` and shell against its own filesystem. **Clients** (web, macOS) only talk to the control plane.
- **Runtimes dial out.** A runtime opens an outbound WebSocket to the control plane and registers with a token, so it works behind NAT. The control plane never connects to a runtime.
- **A runtime belongs to the user who registered it and is shared with that user's organization.** Any member can start a thread in a project on it. Because the shell is not sandboxed (0003), that means org members run commands as the owner's OS user. Registration says so plainly, and the owner can disconnect, rotate or revoke a runtime at any time. A runtime can instead be sandboxed (0009).
- **A project is `(runtime, path)`.** Path validation and the folder browser become requests to the runtime. The control plane keeps a built-in runtime behind the same interface, so a single-machine setup keeps working.
- **Provider keys never leave the control plane.** The runtime gets no key. Its model client points at a gateway on the control plane and authenticates with a per-run token bound to `(sender, providerId, modelId, reasoningEffort)`, minted from the message's choice (0007). The gateway resolves the sender's own provider, adds the key and forwards the request, so per-user isolation (0006) and prompt caching still hold. The token is short-lived and only valid for its run.
- **The control plane owns the transcript.** The projected run events are lossy (no reasoning, clipped tool output), so a replayable history cannot be rebuilt from them. Instead the runtime's agent uses a `MemoryStore` whose `load`, `append` and `clear` are calls to the control plane (`runtime-client/remote-memory.ts`). Anvia loads history at run start and appends per turn as before, and the control plane writes it to Postgres. The scope comes from the control plane's own record of the run, never from the runtime; a runtime can only touch runs the control plane started on its connection, while they are live. A runtime keeps no conversation state, so replacing one loses nothing.
- **The wire contract is language-neutral.** Clients are not required to be TypeScript. The API and the run events are written down (`docs/products/0004-native-client-contract.md`), and the `applyEvent` reducer's behavior is specified, not just implemented, so the Swift client can reimplement it. The event types and reducer move out of `@aven/agents` into `packages/protocol` so no client depends on the engine.
- **Clients choose their server.** The API base URL is configurable (the web app keeps the `/api` proxy). Non-browser clients authenticate with bearer tokens (Better Auth's `bearer` plugin) instead of cookies. Email and password is the only sign-in method, so the app signs in directly and keeps the `set-auth-token` it gets back; no browser round trip is needed. If an OAuth provider is added later, that flow gets the system browser.

## Consequences

- The control plane stops executing user prompts and touching project disks; the shell risk moves to machines whose owners opted in.
- The gateway makes the control plane a hop for every model call: more load, and streaming has to be proxied faithfully. In return keys stay in one place.
- A run needs a connected runtime: sending to a project whose runtime is offline fails with a clear error. Runs in progress end when their runtime disconnects.
- The gateway only forwards the completion endpoints (`/v1/messages`, `/responses`, `/chat/completions`), only for the provider the run's token was issued for, and the token dies with the run or the connection.
- Order of work (done): `packages/protocol` extraction; the runtime interface with the built-in runtime (no behavior change); the remote runtime, registration and gateway; then the macOS client.
- The API contract for non-TypeScript clients is written by hand in `docs/products/0004-native-client-contract.md`; generating OpenAPI would add a dependency and zod support in it is partial.
- Open: token rotation for runtimes, per-project access narrower than the whole organization, signing and releasing the macOS app (it builds with SwiftPM here; an Xcode project, notarisation and updates are not set up), and a model picker in the macOS composer (it sends with the user's default provider).
