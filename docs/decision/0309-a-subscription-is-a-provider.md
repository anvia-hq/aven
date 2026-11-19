# A subscription is a provider

Status: accepted. Supersedes the settings split of 0300 (the Claude agent behind a flag) and 0301
(the Codex agent behind a flag) in the platform, and the storage of their tokens.

## Context

What runs a thread is today two unrelated things:

- **A provider row** (`providers`: `kind` in `openai`, `anthropic`, `gemini`, `bedrock`, `vertex`,
  `azure`, `openai-compatible`), one or many per person, one of them `is_default` (a unique index
  holds that). `providersService.forRun` reads it, `resolveModel` turns it into a `ModelConfig`,
  and the run goes through the control plane's model gateway. Its UI is Settings > Providers.
- **A subscription**, in a table of its own (`claude_setup_tokens`, `codex_setup_tokens`), at most
  one per person, with its own service, router, flag, settings page and UI. A thread that runs on
  one records `threads.agent_backend` (`claude` or `codex`) and the run carries the decrypted token
  (`claudeToken`/`codexToken`) to the runner instead of a `ModelConfig`.

So the same question — "what runs my thread, with whose credential?" — has two answers in two
places, two model menus in the composer ("Subs"/"API" groups beside the provider list), two
credential stores, and no way to say "my Claude subscription is my default": the default is a
provider row, and a subscription is not one. Bots (the next task) have to pick the same thing again.

Constraints that shaped the design: credentials are encrypted at rest with `PROVIDER_ENCRYPTION_KEY`
and never leave the server (`docs/decision/0006`), keys and tokens belong to a person, not a
workspace, and the platform never learns a secret. Decision 0011 says we make format changes in
place with a migration and carry no old shapes.

## Options

### A. A subscription is a provider row

`PROVIDERS` gains `claude-subscription` and `codex-subscription`; their token lives in the same
encrypted `api_key_encrypted` column; `is_default` and its unique index stay one column. A per-kind
descriptor in the control plane says what a kind is: which agent backend it runs (`native`,
`claude`, `codex`), what a valid credential looks like, and how to list its models (the gateway for
native kinds, the static catalog for a subscription). A migration copies the two token tables into
`providers` and drops them.

- **Extensible**: a third hosted backend is one kind and one descriptor; every consumer (threads,
  bots, small models, the composer) already asks for "the provider row" and reads its backend.
- **Migration**: one data migration, no id remapping; the two tables are per-person singletons and
  the copy is `INSERT ... SELECT`.
- **Coupling**: `providers.kind` now mixes "a model API we proxy" with "an SDK we host", which the
  descriptor makes explicit rather than implicit; `resolveModel` must branch on the backend, which
  is exactly one place if the resolver is shared.
- **Failure modes**: a token validates only by shape (`sk-ant-oat01-`, `sk-`), as today; a kind the
  platform offers but the server has turned off still shows up (the flag has to be honoured on
  create, as `requireFor` did).

### B. Two tables, one API

Keep both tables, and have `GET /providers` list providers and subscriptions together with
namespaced ids (`<uuid>` versus `backend:claude`), and one UI over both.

- **No migration**, credentials stay where they are.
- **Every consumer pays**: two id spaces, two reads, and `is_default` can no longer be a unique
  index because it would span two tables (two people-sessions can both be default); the run start,
  the composer, bots and the small-model setting each need the union. This is the shape that is
  cheap now and expensive in every later change.

### C. A provider points at a driver; kinds are data

Split `kind` into `kind` (what the API speaks) and `driver` (how a run reaches it:
`gateway`, `claude-agent`, `codex-sdk`), with a driver registry that owns validation, models and
credential use; a subscription is a driver with no kind-specific API.

- **Most extensible**: a future backend is a driver, and a provider could be reached more than one
  way.
- **Two dimensions where one suffices today**: every current kind maps to exactly one backend, so
  `driver` would be derivable from `kind` and the registry would be a table of one-to-one rows. It
  also renames a column that the wire, the native client and the bot API already read, for no
  behaviour change.
- Worth revisiting if a provider ever runs through more than one backend.

## Decision

**A**, with C's useful half: kinds stay one dimension, and a **descriptor registry** owns what
differs between them, so the next backend is a descriptor rather than a new module, table and UI.

- `PROVIDERS` gains `claude-subscription` and `codex-subscription`; `providerBackend(kind)` in
  `@aven/protocol/providers` is the one mapping from a kind to `native`, `claude` or `codex`.
- `providers` rows keep `apiKeyEncrypted`/`keyHint` for the token, `modelId` for the chosen model
  (a logical id such as `sonnet` or `astra`, as the composer already sends), and `isDefault`.
- `apps/control-plane/src/modules/providers/backends.ts` holds the descriptor of each hosted
  backend: its kind, its flag (`AVEN_CLAUDE_BACKEND`, `AVEN_CODEX_BACKEND`) and the credential
  errors. `providers/models.ts`... no: model catalogs stay in `@aven/protocol/claude-models` and
  `codex-models`, read by `providersService.listModels` for those kinds, so `/providers/:id/models`
  answers for every kind and one model menu serves all of them.
- One resolver owns "what does this selection run": the thread's backend plus the selected (or
  default) provider row gives either a `ModelConfig` (native) or a hosted credential
  (`claudeToken`/`codexToken`, model, effort). `threads.create` sets `agent_backend` from the
  chosen provider row (or the default), the composer sends `providerId` instead of `backend`, and
  `messages.send|steer|compact` call the resolver. A selection whose backend is not the thread's is
  refused.
- The platform has one Providers page: subscriptions are rows like any other, with the same dialog
  (token field plus the existing help text), the same connected/default/disconnect actions, their
  models listed, and a "Subscription" mark. `/settings/claude` and `/settings/codex` and their
  modules go away; `/settings/providers` is the only place. The composer's model menu lists
  subscription models as ordinary choices of their provider (still badged), and a thread that
  already runs on a backend only offers choices of that backend.
- Migration: a hand-written `drizzle-kit generate --custom` migration copies each person's
  `claude_setup_tokens`/`codex_setup_tokens` row into a `providers` row (`claude-subscription`,
  `codex-subscription`, token encrypted as it already was, `is_default` true only for a person who
  has no provider at all, leaning on the one-default index), then a generated migration drops the
  two tables. Tokens are copied verbatim: the same key decrypts them.

## Consequences

- One question, one answer: `providers` is what runs a thread, whose credential it is, and which of
  them is the default — for threads, bots and every model menu.
- A person with only a Claude subscription can make it their default; new threads then start on the
  Claude backend, where before the default could only ever be a native provider.
- The two backends' credentials move to the same encrypted column, so `AVEN_CLAUDE_BACKEND` and
  `AVEN_CODEX_BACKEND` now gate offering the provider kind as well as refusing a run.
- Deleted with the old shape: `claude-setup` and `codex-setup` modules and their routes, the two
  token tables, the settings pages, and the composer's separate Claude/Codex selection state. The
  flags, the model catalogs and the runner-side backends stay.
- A native provider still may not be marked default without a key; a subscription may not be
  created while its backend is turned off.
- One more row per person per backend is possible (`claude-subscription` is single-credential, as
  `openai` and `anthropic` are), so a second Claude subscription means replacing the first.
