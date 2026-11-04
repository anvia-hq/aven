# Anvia's summary compactor sends `temperature: 0`, which reasoning models refuse

Status: fixed upstream in `@anvia/core` 1.17.3. The local workaround was removed when upgrading to it.

## Symptom

A bot or thread whose chat reaches the size set for summarizing stops with:

```
Memory compaction model request failed.
```

The message hides the cause, which is the provider's answer to the summary request, here Azure OpenAI with a reasoning model:

```
400 Unsupported parameter: 'temperature' is not supported with this model.
```

The chat keeps failing on every message, since each one tries to summarize again.

## Cause

`createSummaryMemoryCompactor` in `@anvia/core` defaults `temperature` to `0` and sends it, with `max_output_tokens: 1024`, in its request. Models that reason (OpenAI's and Azure's `gpt-5` and later) take no temperature. The wrapper `MemoryCompactionError` keeps the provider's error only as its `cause`.

## Workaround

Before 1.17.3, `compactionFor` and the explicit compaction agent passed `temperature: null`, which the compactor takes as "send none". The provider's default applies. `errorMessage` (`values.ts`) adds the cause of a wrapping error to the message, so a failure like this one says why. Checked against a real conversation of 52 messages and 1.2 MB, mostly screenshots, on the model that failed.

## Upstream fix

Version 1.17.3 omits temperature unless explicitly supplied, bounds inline image and file data in token estimates, and includes the provider's message in a compaction failure. Both Aven compaction paths now use that default; the provider-request regression still checks that no temperature is sent. The independent error-cause formatter remains.
