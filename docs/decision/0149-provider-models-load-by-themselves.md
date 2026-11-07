# 0149: A provider's model is picked from a list that loads by itself

Status: accepted.

## Context

The provider dialog asked for a model in a text box, with a "Load models" button beside it. Azure and Vertex AI had no list at all, so their model was always typed.

## Decision

- Every provider's dialog has one Model dropdown and no button. The list loads a moment after the key, address, region, project or location stops changing, and at once when an edit opens with a stored key.
- Before the list can load, the dropdown says which field it waits for; when loading fails, the reason shows under it.
- Vertex AI has no list of its own, so the control plane offers the current Gemini models of the models.dev catalog (`google/<model>`).
- Bedrock, Vertex AI, Azure and OpenAI-compatible providers need a model to save; the others fall back to the provider's default.

## Consequences

- Nobody types a model id any more. A model the list lacks cannot be chosen; the one a provider was set up with stays on offer.
- Vertex AI depends on models.dev being reachable, and offers no Claude or Mistral models there.
