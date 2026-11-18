# A model's reasoning levels come from the server, then its vendor

Status: accepted. Extends 0078 (a gateway says which reasoning levels its models take) and 0141 (the presets of Settings > Providers). Was decided after a DeepSeek provider offered no reasoning slider at all.

## Context

0078 gave an `openai-compatible` provider its levels from the server's own `/model/info`, and nothing else. That endpoint is LiteLLM's: it is there for a gateway someone runs and absent from every vendor the presets name. So OpenRouter, Groq, DeepSeek, Mistral and xAI — five of the six presets, all of them `openai-compatible` — never offered a slider, and their models had no context window either, so compaction never triggered for a thread running on one, either. Ollama is the sixth and has no levels to offer.

DeepSeek is where it showed. Its `/model/info` is a 404, its models therefore got `effortLevels: null`, and `reasoningControlsFor` refused to build a control from nothing: no slider in the composer, no `reasoning_effort` on the request. Meanwhile the vendor states exactly what 0078 wanted, in two places a person can already see: `GET /models` gives each model a `context_window` and an `effort` of `supported_levels` and `default_level`, and models.dev has the same model under `deepseek`, with `reasoning_options` and `limit.context`. The levels agreed (low, high, max).

The same reading of `/models` also settled a second thing: `deepseek-chat`, the model the preset used to seed, is now a non-thinking alias of `deepseek-flash`. Asked for it, the API answers as `deepseek-flash` with no `reasoning_content`. Nothing about a name says whether a model thinks; only what the server and the vendor say does.

## Options

- **models.dev alone** (the fallback that was being designed). It knows the presets well, but it is curated, not live: it lags a vendor's renames, it has no `ollama`, and it cannot know a model a person runs behind an address of their own. On its own it would also not answer for the LiteLLM gateway 0078 was written for.
- **A catalog key stored on the provider row.** The explicit answer, and the one to take when someone serves a vendor's models behind an address we cannot recognise (a proxy, a vLLM with `deepseek-*` weights). It costs a migration and a field nobody wants in the dialog to fix a case no preset has today.
- **A chain of sources, resolved per field.** Every source we already read for another kind of provider, in the order that puts the server we are talking to first and the curated list last.

## Decision

- The facts of an `openai-compatible` model — its effort levels, its default effort, its context window and its label — come from the first source that has something to say, in this order: the server's `/model/info` (LiteLLM), the vendor's own `GET /models` entry (`context_window`, `effort.supported_levels`, `effort.default_level`, `name`), then models.dev under the vendor the address names (`compatibleModelFacts`, `model-facts.ts`).
- The vendor is the address's host, not a guess from the model's name: `COMPATIBLE_VENDORS` in `packages/protocol/src/providers.ts` holds each preset's address and its models.dev key, and `catalogVendorOf` matches on the host, so `https://api.deepseek.com` and `https://api.deepseek.com/v1` are the same vendor. The presets in Settings take their addresses from that table, so there is one place an address can be wrong.
- **A source that does not list the model has not said the model takes no effort.** Levels come from the first source that either lists levels or states that the model takes none: a gateway that lists a model without `supports_reasoning_effort` keeps 0078's "none", and models.dev's levels for it are not used. A `/models` entry that names the model and says nothing about an effort is not a statement — a listing may carry only ids — so the vendor's curated entry still decides. Every other field is the first non-null value, so a gateway that gives a window but no label is completed by models.dev.
- `/model/info` is asked first and alone when it answers: an address that speaks it pays one request an hour, and only an address that says nothing there is asked for `/models`. Neither answer is kept when it is none.
- The default effort a source names travels as the control's `defaultValue` (`reasoningControlsFor`), so a model that defaults to `high` starts the composer at `high` rather than at the first level in the list.
- The `exampleModel` field of the presets is gone. It was read nowhere, and it had drifted into naming a model that no longer thinks.

## Consequences

- The composer offers a reasoning effort for a DeepSeek, OpenRouter, Groq, Mistral or xAI model, the run carries it, and `applyEffort` accepts it because the picker and the run resolve through the same function. Those threads also get a context window, so compaction triggers.
- Ollama, and any address that is not a preset and speaks neither shape, keep the old behaviour: no slider and no window, rather than a guessed one.
- A model whose vendor lists only a `toggle` (most OpenRouter models, and DeepSeek's own entries, which offer both) still gets no slider: a toggle is not an effort, and turning reasoning off is a control this does not add.
- Bedrock and Vertex are unchanged: they stay without levels, though models.dev lists some for them.
- A provider pointed at a vendor's models through an address we do not recognise gets the gateway's answer or nothing. Should that matter, the catalog key becomes a column on `providers`, consulted before the host is.
- Labels come back with the levels, so those models show the vendor's name for them in the composer and in Settings instead of the raw id.
