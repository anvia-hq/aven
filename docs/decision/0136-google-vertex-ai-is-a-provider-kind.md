# Google Vertex AI is a provider kind

Status: accepted.

## Context

Vertex AI has an OpenAI-compatible API for Gemini and other models: `POST https://<location>-aiplatform.googleapis.com/v1/projects/<project>/locations/<location>/endpoints/openapi/chat/completions` (`https://aiplatform.googleapis.com/...` for the `global` location), with models named `<publisher>/<model>` such as `google/gemini-2.5-flash`. It takes only Google Cloud auth: an OAuth access token as the bearer token, which lives for one hour. It has no `GET /models`. `@anvia/openai` takes a base URL, so no new SDK is needed (the Gemini API key kind, decision 0134, is a different product with a different credential).

## Decision

- **A new kind, `vertex`, on `@anvia/openai` with `api: "chat"`.** The form asks for a project id and a location (default `global`) and sends the endpoint it makes (`vertexBaseUrl` in `@aven/protocol/providers`), which the `baseUrl` column holds. A model id is required and typed by hand (no list to load); `list_provider_models` and the form's model offer only the saved one. As for Bedrock, the server accepts only Google's own host with the same region in host and path (`vertexPartsOf`), on create and update, since the credential is sent there.
- **The credential is a service account's JSON key, traded for a token by the control plane.** A token that lives an hour cannot be stored, so the key is: `providers/google-auth.ts` signs an RS256 assertion with `node:crypto` (no new dependency), posts it to `https://oauth2.googleapis.com/token` (the key's own `token_uri` is ignored, so a key cannot choose where it is traded), and keeps the token until five minutes before it ends, one exchange for runs that start together. The gateway does this when a runtime's request arrives, so a runtime never holds the key or the token. A failed exchange is a 502 that says why (a refused key, Google unreachable).
- **A pasted access token also works**, used as it is: for trying it out, and it stops when Google refuses it (an hour later). Nothing refreshes it.
- **Many per person**, one for each project or location. The key's hint is the end of its `private_key_id`.
- **Chat completions only; no reasoning effort.** The SDK has no controls for these model ids and Vertex lists no levels, so none is offered (as for Bedrock), although Google documents `reasoning_effort` for Gemini. The catalog is models.dev's `google-vertex`, looked up without the `google/` prefix, for the context window and image support.

## Consequences

- The wire version is 45: an older runner would build an Anthropic client for a Vertex run.
- Application Default Credentials, workload identity federation and user credentials are not supported. The service account needs the `Vertex AI User` role (`roles/aiplatform.user`) on the project.
- Not verified against a live project here: the exchange and the endpoint shapes follow Google's documentation and are tested against local servers and a generated key.
