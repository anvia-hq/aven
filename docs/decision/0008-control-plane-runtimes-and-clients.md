# One control plane, many runtimes, many clients

Status: accepted (direction; nothing built yet). Builds on 0004 (server-owned runs, SSE). Changes where 0003 (agent execution), 0005 (project paths) and 0006 (provider keys) apply: they keep holding for the control plane, and the agent side moves to runtimes.

## Context

Today the control plane is also the runtime. It runs the agent loop in-process, owns the filesystem the agent edits (a project is an absolute path on its disk) and runs the unsandboxed shell. The goal is a single control plane that users can attach their own machines to, and several clients: the web app, and a native macOS app (Swift, Xcode, no web view and no iframe).

## Decision

- **Three parts.** The control plane holds auth, organizations, providers and keys, threads, transcripts, the runtime registry and run routing. A **runtime** is a separate process on any machine; it runs the agent loop, tools, `JobRegistry` and shell against its own filesystem. **Clients** (web, macOS) only talk to the control plane.
- **Runtimes dial out.** A runtime opens an outbound WebSocket to the control plane and registers with a token, so it works behind NAT. The control plane never connects to a runtime.
- **A runtime belongs to the user who registered it and is shared with that user's organization.** Any member can start a thread in a project on it. Because the shell is not sandboxed (0003), that means org members run commands as the owner's OS user. Registration says so plainly, and the owner can disconnect or revoke a runtime at any time.
- **A project is `(runtime, path)`.** Path validation and the folder browser become requests to the runtime. The control plane keeps a built-in runtime behind the same interface, so a single-machine setup keeps working.
- **Provider keys never leave the control plane.** The runtime gets no key. Its model client points at a gateway on the control plane and authenticates with a per-run token bound to `(sender, providerId, modelId, reasoningEffort)`, minted from the message's choice (0007). The gateway resolves the sender's own provider, adds the key and forwards the request, so per-user isolation (0006) and prompt caching still hold. The token is short-lived and only valid for its run.
- **The control plane owns the transcript.** It persists messages from the event stream and sends history to the runtime when a run starts. A runtime keeps no conversation state, so replacing one loses nothing. The Anvia memory store stays on the control plane.
- **The wire contract is language-neutral.** Clients are not required to be TypeScript. The API is described by OpenAPI (from Elysia) and the run events by JSON schema, and the `applyEvent` reducer's behavior is specified, not just implemented, so the Swift client can reimplement it. The event types and reducer move out of `@aven/agents` into `packages/protocol` so no client depends on the engine.
- **Clients choose their server.** The API base URL is configurable (the web app keeps the `/api` proxy). Non-browser clients authenticate with bearer tokens (Better Auth) instead of cookies, signing in through the system browser with a callback to the app.

## Consequences

- The control plane stops executing user prompts and touching project disks; the shell risk moves to machines whose owners opted in.
- The gateway makes the control plane a hop for every model call: more load, and streaming has to be proxied faithfully. In return keys stay in one place.
- A run needs a connected runtime: sending to a project whose runtime is offline fails with a clear error. Runs in progress end when their runtime disconnects.
- Order of work: `packages/protocol` extraction; the runtime interface with the built-in runtime (no behavior change); the remote runtime, registration and gateway; then the macOS client.
- Open: runtime registration and token rotation UX, per-project access narrower than the whole organization, and how a Swift client is built and released.
