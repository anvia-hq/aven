# `@typesafe-ai/sdk` fails every call on Bun with "Body already used"

Status: worked around by `bufferedFetch` in `apps/control-plane/src/modules/decision-model/jev.ts`; found on 2026-11-09 with `@typesafe-ai/sdk` 0.7.0 and `@anvia/jev` 0.2.1 on Bun 1.4.4, against OpenRouter's Jev endpoint.

## Symptom

`decide()` through `@anvia/jev` rejects with `TypeError: Body already used` (`ERR_BODY_ALREADY_USED`) from `parseBody`, although the server answered 200 and the body was valid JSON.

## Cause

After a response arrives, the SDK's `bufferResponse` clones it, takes a reader on both the clone and the original, reads the clone to the end and releases both locks. On Bun, a response whose original body has been read through a reader and released then refuses `res.text()` in `parseBody`.

## Workaround

The client is built with its own `fetch` that reads the body to bytes and returns a new `Response` over a `ReadableStream` of those bytes. The SDK's locks and release then behave. A new `Response` over the buffered text did not help on Bun 1.4.4; only the stream-backed one did.

## When to remove it

When the SDK stops locking the original body, or Bun lets a released body be read again. Remove `bufferedFetch` and check that a call through `JevClient` returns an answer.
