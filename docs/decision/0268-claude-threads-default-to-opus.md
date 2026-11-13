# 0268. Claude threads default to Opus

Status: accepted. Changes the default of 0245. The table, the menus and the aliases stay as they are.

The Claude Agent SDK now resolves its `default` alias to `claude-opus-5-5`, not to `claude-sonnet-5-5`, and the runtime-client test that checks the table against the SDK failed on that difference.

- The `default` row of `@aven/protocol/claude-models` resolves to `claude-opus-5-5` and reads "Default · Opus 5.5" in the model menu, with the trigger "Claude Opus 5.5".
- The `sonnet` row is unchanged, so Sonnet is still one choice in the menu.
- The table is the only place that names the default. The SDK check in runtime-client is what keeps it in step with the SDK.

Consequences: a Claude thread started with the default model now runs on Opus 5.5, which is a more capable and more costly model than Sonnet 5.5. A person who wants Sonnet picks it in the menu. The default can move again by changing the `default` row, and the test then fails until the table matches the SDK.
