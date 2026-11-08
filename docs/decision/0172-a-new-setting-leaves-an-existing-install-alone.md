# A setting a new template adds leaves an existing install alone

Status: accepted. Replaces the rule 0079 gave `SETTINGS_BEFORE` for the same function.

## Context

`aven update` rewrites the server's `.env` with the template of the release it carries, and `addMissingKeys` (`apps/cli/src/env-file.ts`) is what decides what a key the file lacks gets. It added every key of the template with the template's value, except the secrets `newSecrets()` makes and the keys of a one-entry map, `SETTINGS_BEFORE`, which gave `AVEN_BIND` the empty value an install from before that setting behaved with (0079).

So the template was the default, and a key had to be remembered in a map to be spared it. The map said nothing about why, and the two answers a key can have were not told apart: a key whose template value is wrong for an install that already exists, and a key whose template value is exactly what that install needs. Whoever adds a setting to `deploy/env.example` has to pick one, and the file they edit gives them no place to say which.

## Decision

`addMissingKeys` takes an explicit policy per key, `ADDED_KEY_POLICY`, and its default is the install. A key the existing `.env` does not have is written only when something names it:

- **A secret the installer makes** (`newSecrets()`, such as `WORKLOAD_IDENTITY_PRIVATE_KEY` or `AVEN_LOCAL_RUNNER_TOKEN`) is made and written. An install from before the secret has none, and the server needs one it can read.
- **A key listed as keeping the install's value** is written with the value the policy gives, which is what the install did before the key existed, never the template's. `AVEN_BIND: ""`: empty is every address, which is how an install from before the setting published its web port; the template's `127.0.0.1` would take a server off the network it was reachable on (0079).
- **A key listed as taking the template's value** is written with the template's. `AVEN_LOCAL_RUNNER: host`: with no key at all the control plane runs sandboxes inside itself (`localRunnerMode` falls back to `on`), which cannot work in the compose server, so an install that predates the key is given the template's `host` rather than the fallback.
- **Any other key is not written.** The install keeps what it has, which is the value its code defaults to, the same as before the key existed. Nothing is copied in on the install's behalf, so a template value that is meant to reach an existing install has to be listed, and a key whose code default is already the template's value needs no entry (`AVEN_REGISTRATION`: absent is open, as `registrationDefault` reads it).

A key the `.env` already has is never rewritten, whatever the policy says about it; a person's own value is theirs.

## Consequences

- Adding a setting to `deploy/env.example` now ships its value to new installs only. An install that must be given a value on update needs an entry in `ADDED_KEY_POLICY`, which is a deliberate line to add and to say why in a decision doc: silence is the safe answer, not the loud one.
- An updated install's `.env` no longer grows with keys it did not have and does not need, so what a person reads there is the settings they have rather than the whole template.
- The name `SETTINGS_BEFORE` is gone; `docs/rules/0005-releasing.md` ("A new setting", which also still says `aven update` copies the template's default) and 0079's third bullet describe the old map and are the next edits owed to this.
- The two answers a key can have are now visible in one place, and `env-file.test.ts` holds each of them: a key present only in the template and named by no policy is absent afterwards, one listed as keeping the install's value takes the policy's, and one listed as taking the template's takes it.
