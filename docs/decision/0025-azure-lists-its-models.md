# Azure providers list the resource's deployments

Status: accepted. Supersedes the "No model list" point of [0019](0019-azure-openai-provider.md).

## Context

A saved Azure provider offered only the deployment it was set up with, so the model picker in a thread had one entry. The resource's v1 `GET /openai/v1/models` is no help: it lists the models the resource could deploy, not what is deployed (the first version of this decision used it and offered every model). opencode asks the resource for its deployments instead.

## Decision

- **List `GET <resource origin>/openai/deployments?api-version=2022-12-01`** with the key as `api-key`. Each item is `{ id, model, status }`; `id` is the deployment name, which is what a run sends as the model. Only `succeeded` deployments are offered. Later data-plane versions dropped this route, so the version is pinned. The list is then filtered through models.dev like the others, by the deployment's name (an unknown name stays).
- **The deployment the provider was set up with comes first** and stays on offer if the listing fails (unreachable, wrong key, a resource that does not serve the route).
- `POST /providers/models` accepts `kind: "azure"` too. The deployment is still typed by hand in the provider dialog.

## Consequences

- A deployment named unlike its model has no effort levels or context window, as before (0019).
- Azure AD tokens and the management API (which opencode also tries) stay out, as in 0019.
