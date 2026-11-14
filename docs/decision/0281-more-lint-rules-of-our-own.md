# 0281: More lint rules of our own

Status: accepted.

## Context

Aven has five lint rules of its own (`no-comments`, `no-conditional-spread`, `no-barrel-file`, `no-native-primitives`, `padded-if`), all in one plugin file with no tests. Review comments kept pointing at the same few habits that make code harder to read or less honest about its types: `Reflect.get` in proxies, `.filter(...).map(...)` walking an array twice, `x as unknown as T`, `type X = unknown`, module mocks that leak between tests, and copying the accumulator on every step of a `reduce`.

The ideas for these rules come from the `anti-slop` project (github.com/dmmulroy/anti-slop). We took the ideas only. Every rule here was written from scratch from a one-line description of its behaviour, in the style of the existing rules. No code or rule source of that project is in this repository.

## Decision

- **One file per rule.** Rules live in `tooling/oxlint/rules/<name>.mjs`, helpers shared by rules in `tooling/oxlint/shared/`, and `tooling/oxlint/aven-plugin.mjs` is only the index. The five old rules moved unchanged.
- **Every rule has tests.** `tooling/oxlint/rules/<name>.test.mjs` writes a fixture and a config to a temp directory, runs the real `oxlint` CLI on it and reads its JSON (`tooling/oxlint/testing/lint.mjs`). oxlint's own `RuleTester` refuses to run under Bun, so the CLI is the closest thing to what CI does. `bun test apps packages tooling` runs them, and CI runs that command.
- **Seven new rules**, all `error`:
  - `aven/no-reduce-accumulator-copy`: a `reduce`/`reduceRight` callback must not return `Object.assign({}, acc, ...)`, `acc.concat(...)` or `acc.slice()`. Mutate the accumulator and return it. Spreads are left to the native `oxc/no-accumulating-spread`, which is now on too.
  - `aven/no-reflect-apply` and `aven/no-reflect-get`: use `fn.apply(...)` and typed property access. In a proxy handler the receiver equals the target at every site, so `target[key]` reads the same value.
  - `aven/no-array-filter-map`: no `.filter(...).map(...)` or `.map(...).filter(...)` on one chain. Use `flatMap` or a loop.
  - `aven/no-chained-type-assertions`: no `x as unknown as T`. `as const` is exempt. An `overrides` entry turns it off for `*.test.ts`, `*.test.tsx`, `e2e/` and `testing/` folders, where fakes need it.
  - `aven/no-unknown-type-aliases`: no `type X = unknown`.
  - `aven/no-module-mocking`: no `mock.module`, `jest.mock`, `jest.doMock`, `jest.unstable_mockModule`, `vi.mock` or `vi.doMock`. Inject the dependency instead.
- **Existing code was fixed in the same change**, with no change in behaviour: five `Reflect.get` sites, eleven chained assertions in source, and every filter-and-map chain (including tests and `e2e/`).
- **Ideas deliberately not taken:**
  - `require-safety-comment-for-type-assertion`: it asks for a comment on each assertion. That conflicts with 0149 (no comments in TypeScript).
  - `require-readable-spacing`, `no-unknown-parameters`, `no-runtime-typeof`, `no-unsafe-dictionary-type`, `no-known-value-widening`, `no-unknown-returns`, `no-shape-in-symbol-names` and `no-widen-then-assert`: each would flag hundreds of places that are fine today, for a style gain too small to pay for the churn.

## Consequences

- A new rule is a file in `rules/`, a test beside it, a line in the index and a line in `.oxlintrc.json`.
- `flatMap` with `[]` for "skip" is the house way to filter and transform at once.
- Tests and e2e may still use `as unknown as` for fakes; source may not. Code that needs a cast across unrelated types gets a typed helper or a narrower type at the declaration.
- Module mocking is banned everywhere, so a test that needs to replace a module must change the code to take that dependency as an argument.
