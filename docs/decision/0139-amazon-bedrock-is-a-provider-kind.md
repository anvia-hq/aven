# Amazon Bedrock is a provider kind

Status: accepted.

## Context

Bedrock serves models of many vendors, and AWS offers an OpenAI-compatible API for them (Chat Completions, and Responses for some), so no new SDK is needed: `@anvia/openai` takes a base URL. AWS has two such endpoints, checked against its documentation:

- `bedrock-mantle`: `https://bedrock-mantle.<region>.api.aws/v1`. Has `GET /models`. Takes a Bedrock API key as a bearer token. A few models are under `/openai/v1` instead.
- `bedrock-runtime`: `https://bedrock-runtime.<region>.amazonaws.com/openai/v1`. Takes a Bedrock API key or SigV4. Has **no** `/models`, and not every model is served on it.

AWS's pages disagree on which one is recommended, so the choice below is ours.

## Decision

- **A new kind, `bedrock`, on `bedrock-mantle` `/v1`.** It is the one that lists its models, so the Providers form can offer them like the other kinds. A model that AWS serves only under `/openai/v1` is not reachable; that is the known limit.
- **Region in, endpoint stored.** The form asks for a region (`us-east-1`) and sends the endpoint it makes (`bedrockBaseUrl` in `@aven/protocol/providers`); the `baseUrl` column holds it, a model id is required, and the API key is a Bedrock API key. The control plane calls the endpoint with the person's key, so the server accepts only AWS's own regional host (`BEDROCK_ENDPOINT`: https, `bedrock-mantle.<region>.api.aws`, path `/v1`), on create, update and model listing. A bot that sets a different region moves the provider, so its key is dropped, as for any change of address (decision 0086).
- **Many per person.** One for each region or key, like OpenAI-compatible servers.
- **Chat completions only.** The runner builds `OpenAIClient` with `api: "chat"` against the gateway, which forwards only `/chat/completions` to the stored endpoint with the key as a bearer token and pins the model.
- **No reasoning effort.** The SDK has no controls for Bedrock's model ids and AWS lists no levels, so none is offered (as for an OpenAI-compatible server without a gateway). Models are filtered through models.dev's `amazon-bedrock` entries (by name where it lacks them, dropping embeddings and image, video and speech models); a context window is known only where the id matches models.dev's.
- **Auth is a Bedrock API key only.** SigV4 and the AWS credential chain are not supported: a long-lived key is what a stored per-person provider can hold. Bedrock API keys can be short-term and expire; the person gives a new one when it does.

## Consequences

- The wire version is 44: an older runner would build an Anthropic client for a Bedrock run.
- Not verified against a live Bedrock account here: the endpoint shapes are from AWS's documentation and the code is tested against local servers.
