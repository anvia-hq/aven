# — The installation's one sandbox platform is chosen in Settings > Sandbox

Status: accepted. Superseded in part by 0328: the name of the built-in computer. Decided 2026-11-17.

## Context

Decision 0311 made a spaces server a platform setting, but boat.dev stayed in the environment
(`AVEN_BOAT_API_KEY`, `AVEN_CLOUD_PROVIDERS`), the environment won over the form, and the form sat
inside Settings > Installation. Two platforms could be on at once, each with a template of its own
named "Aven Cloud · boat" or "Aven Cloud · spaces". An installation does not need that: it has one
sandbox host.

## Decision

- **One page, one sandbox.** Settings > Sandbox (platform owners only) takes the platform (`boat` or
  `spaces`), the platform's API address, the address a sandbox dials and its key. Saving replaces
  whatever was saved; there is never more than one. Spaces needs its address; boat's is optional
  and defaults to `https://boat.dev/api/v1`. The address a sandbox dials is optional for both and
  defaults to `BETTER_AUTH_URL/api`. Changing platform asks for that platform's own key, as the saved
  one belongs to the other.
- **Nothing is read from the environment.** `AVEN_CLOUD_PROVIDERS`, `AVEN_BOAT_API_KEY`,
  `AVEN_BOAT_API_BASE`, `AVEN_BOAT_RUNNER_URL`, `AVEN_SPACES_API_BASE`, `AVEN_SPACES_API_KEY` and
  `AVEN_SPACES_RUNNER_URL` are gone, so the form is never read-only and a save is never a `409`.
  `AVEN_BOAT_AUTO_STOP_SECONDS` and `AVEN_SPACES_AUTO_STOP_SECONDS` stay: they are tuning, not
  credentials (decision 0311).
- **The package holds one value.** `sandbox/src/settings.ts` keeps the saved `SandboxSettings`, which
  `cloudSettingsService.apply()` hands in at start and after every save or removal. `boat/` and
  `spaces/` read it through `sandboxSettingsOf(name)`, which is empty for the platform that is not
  the saved one, so a provider is on only when it is the saved one and has what it needs.
- **The row keeps its key, `spaces_settings`.** A row saved before this has no `provider` and reads
  as `spaces`, so an installation already set up needs no migration. An installation that used boat
  through the environment has to enter its key in the page once.
- With one platform on, the template is named "Aven Cloud", with no suffix.

## Consequences

- Changing platform turns the other's template off: threads already on the first platform stay
  readable but cannot wake, and their sandboxes are not deleted by the expiry sweep, which has no key
  for them, until that platform is saved again.
- The key is in the database, encrypted, for both platforms.
