# A built-in skill explains identity tokens

Status: accepted. Extends 0087 (built-in skills explain Aven's own features) and builds on 0049 (a run can mint OIDC identity tokens).

## Context

0049 gave a thread's sandbox `aven id-token`, and the agent's instructions say in one sentence that it exists. Nothing told the agent how to use it well: what the person has to set up on the provider's side, why a trust rule must match on `sub` or `organization_id` and not only the issuer, that a token is a credential that must not be printed, or what a failure means. An agent without that either asked for a long-lived key or guessed at a provider's setup.

## Decision

- **A seventh built-in skill, `use-identity-tokens`,** in `apps/control-plane/skills/`. It says where the command works (a thread's run only: a bot's computer and the setup container have no identity), how to mint one (`--audience`, `--subject-scope`, `--lifetime`, the narrowest that a rule allows), how to handle it (straight into the command that needs it, never printed, stored or committed; decode only the middle part to look at the claims), what the person sets up on the provider (issuer URL, audience, a trust rule on `sub` or `organization_id`) and the shape for AWS, Google Cloud, Vault, Tailscale and the person's own service, and what each failure means.
- **It holds to the rules of 0087:** it does not ask for a key to work around a refusal, and where the agent cannot act (the provider's side) it walks the person through it.
- **It describes the shape of each provider's setup, not exact fields.** None was tried against a real provider when this was written, and the fields differ by provider and by version, so the skill sends the agent to the provider's own page for them.
- `aven-help` points to it, and the skills test lists it.

## Consequences

- Every run's instructions list one more skill by name and description; its text is read only when needed.
- When 0049 changes (a new claim, a setup identity, a token exchange), the skill changes in the same commit.
