# The lint keeps code spaced and consistent

Status: accepted. Extends 0149 and the custom rules in `tooling/oxlint/aven-plugin.mjs`.

## Context

The repo relied on `correctness` rules, a few custom ones, and review for everything else. That left common mistakes to reviewers, and there was no enforcement of the shape the code had settled into: no nested ternaries, no conditional spreads, no comments in TypeScript, and a blank line around an `if` block so control flow stands out from the statements around it.

## Decision

- **`aven/padded-if`** (custom, auto-fixable): every `if` has a blank line above and below it. The check applies where the `if` is a direct child of a program, block, static block, `switch` case or TypeScript module block; an `else if` chain is one statement, and a block or `case` boundary counts as padding. `oxlint --fix` inserts the lines.
- **`aven/no-conditional-spread`** now also checks JSX spread attributes, not only `SpreadElement`, so `<Thing {...(cond && props)} />` is refused too.
- **Standard rules enabled**: `eqeqeq` (`smart`, so `== null` stays), `import/no-duplicates`, `no-inline-comments`, `no-lonely-if`, `no-nested-ternary`, `no-useless-return`, `no-var`, `prefer-const`, `typescript/consistent-type-imports`, `typescript/no-import-type-side-effects`, and the unicorn rules for `prefer-includes`, `prefer-node-protocol`, `prefer-number-properties`, `prefer-structured-clone` and `throw-new-error`.
- **The `import` plugin is on** and `import/no-duplicates` replaces the eslint `no-duplicate-imports`: the former keeps a value import and an `import type` from the same module separate, which the type-only convention needs.
- **Left off on purpose**: `no-template-curly-in-string` (shell and compose strings use `${VAR}`), `no-console` (server logging), `require-await` and `no-await-in-loop` (async wrappers and sequential work), `typescript/no-non-null-assertion` (the code relies on `!`), `unicorn/no-null` and `no-useless-undefined` (noise), and the whole `pedantic` category (too many line-count rules).

## Consequences

- The padded-`if` rule reformatted 605 files in one change; new code must be written with the blank lines, and `bun run lint` fails otherwise.
- The lint run is stricter, so a pull request may need small mechanical edits before CI passes.
- The exclusions above are judgement calls; a future rule can be turned on when its existing hits are paid down.
