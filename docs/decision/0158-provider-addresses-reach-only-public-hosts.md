# 0158: A provider's address reaches only public hosts unless the server owner allows the host

Status: accepted.

## Context

A person types the base URL of an `openai-compatible` provider, or the resource URL of an Azure one. The control plane then sends requests there with that person's key: when listing models, when reading a gateway's context window (`/model/info`) and when forwarding a run's model calls. Nothing checked the address, so any signed-in person could make the control plane request loopback, link-local (the cloud metadata address) or private hosts with an `Authorization` header and read back the answers (bug 002).

## Decision

- Before any request to an address a person typed (kinds `azure` and `openai-compatible`), the control plane resolves the host and refuses it when any of its addresses is private, loopback, link-local, carrier-grade NAT, multicast, reserved, or an IPv6 transition or unique-local address (`apps/control-plane/src/modules/providers/address-guard.ts`).
- The check runs for model lists, the gateway's `/model/info` reads and the gateway's forwarding of model calls. Redirects are not followed (`redirect: "error"`), so a public host cannot send the request to an internal one.
- A deliberately internal provider (a local Ollama at `localhost`, a gateway on the company network) is allowed by name: `PROVIDER_ALLOWED_HOSTS`, a comma-separated list of host names, empty by default. Allowed names skip the check; they are not resolved.
- Built-in providers (OpenAI, Anthropic, Gemini, Bedrock, Vertex AI) use fixed or AWS/Google hosts and are not checked.

## Consequences

- Self-hosted providers on an internal address stop working until the owner lists their host in `PROVIDER_ALLOWED_HOSTS`. The OpenAI-compatible presets for Ollama, which use `http://localhost:11434/v1`, need `localhost` there.
- Each model call to such a provider resolves its host first: a small cost.
- The check resolves the name and then the request resolves it again, so a host that changes its answer between the two (DNS rebinding) is not caught. Pinning the connected address would need a fetch that accepts a resolved address, which Bun's `fetch` does not offer.
