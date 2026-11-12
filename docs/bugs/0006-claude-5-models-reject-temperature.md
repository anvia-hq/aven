# Claude 5 models reject `temperature`

Status: worked around by not sending it in `apps/control-plane/src/modules/follow-ups/suggest.ts`; found on 2026-11-12 with `claude-haiku-5-5` through Aven's Anthropic provider and `@anvia/core` 1.18.0.

## Symptom

Follow-up suggestions (decision 0226) never appeared. The server logged `ExtractionError: No data extracted`, caused by the API's `400 invalid_request_error: temperature: Extra inputs are not permitted`. `extract` had been given `temperature: 0.7`.

## Cause

The Claude 5 family does not take a `temperature` parameter, and the request carries whatever `extract` is given. The error is swallowed (`suggestFollowUps` returns no suggestions and logs), so the feature simply looked dead.

## Workaround

`suggestFollowUps` sends no `temperature`, so the model's default is used. Nothing else in the repository sets one.

## When to remove it

It need not be removed. Send `temperature` again only for a model that accepts it, after checking the model's own documentation.
