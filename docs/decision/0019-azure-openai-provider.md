# Azure OpenAI is a provider kind

Status: accepted.

## Context

Providers were `openai`, `anthropic` and `openai-compatible`. Azure OpenAI is addressed by a resource URL and a key, and names its models by deployment, so neither the OpenAI kind (fixed root) nor the compatible one (no Azure auth or v1 root) fits it well. `@anvia/azure` wraps the OpenAI SDK for it.

## Decision

- **A new kind, `azure`.** It reuses the `providers` columns: `baseUrl` holds the resource origin (`https://<resource>.openai.azure.com`, HTTPS only, any path dropped) and `modelId` holds the deployment name. Both and the API key are required. The `kind` column is plain text, so no migration.
- **Through the gateway like the others.** The control plane forwards `/responses` and `/chat/completions` to `<resource>/openai/v1`, with the user's key as `api-key` and as a bearer token, and pins the deployment and reasoning effort as it does for OpenAI. The runner builds `AzureOpenAIClient` against the gateway.
- **No model list** (superseded by [0025](0025-azure-lists-its-models.md)). Azure lists base models, not deployments, so a saved Azure provider offers only its own deployment. Effort levels and the context window are looked up by the deployment name in the SDK and in models.dev' `azure` entries, so a deployment named unlike its model has neither.
- **One credential each.** A user has at most one OpenAI, one Anthropic and one Azure provider (the service refuses a second); only OpenAI-compatible providers can be added many times. The page hides Add once one is connected; to change a key or deployment, remove it and add it again.
- **The Providers page has one section per kind** (OpenAI, Anthropic, Azure OpenAI, OpenAI-compatible), each with its own add button and dialog, instead of one list with a Type select.

## Consequences

- The wire version is 7: a runner older than that would build an Anthropic client for an Azure run, so it is refused at hello instead.
- `@anvia/azure` refuses plain HTTP to non-loopback hosts, so a runner that reaches its control plane over `http://` on a LAN cannot use an Azure provider; use HTTPS or run the runner on the control plane's host.
- Azure AD tokens are not supported, only keys.
