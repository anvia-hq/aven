# The server's small model is tried when it is saved

Status: accepted. Extends 0241 (a server may give follow-ups a small model).

## Context

A follow-up suggestion that fails is only logged (0226): a missing button costs less than a toast. On the hosted beta the saved small model's key was refused by the provider ("invalid x-api-key") on every call, so no one got suggestions and nothing on screen said why. The settings page accepted the key because saving only encrypted and stored it.

## Decision

- **Saving the server's small model makes one small call with it**, the same `extract` the suggestions use, with a 15 second limit. A refusal, a missing model or a timeout answers 422 "The provider did not accept this key and model" and nothing is written.
- **A save without a key checks the saved key** with the new model, so a change of model alone is tried too.
- **A server small model set by environment variables is not tried**: it cannot be changed here, and the operator who set it sees the error at start-up of the first call in the logs.

## Consequences

- A key that stops working later is still silent for the people using it; only the next save finds it.
- Saving costs one small call.
