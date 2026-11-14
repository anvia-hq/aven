# 0285. A summary has no output limit

Compacting a native thread on a reasoning model could end with "Memory compaction model returned an empty summary." `@anvia/core`'s summary compactor always sends `maxTokens`, 1,024 when none is given, so a model that spends its output budget on reasoning returned no text.

- The summary request drops `maxTokens` for every provider but Anthropic (`summarizerFor`, `withoutOutputLimit`), so the provider's own limit applies.
- Anthropic keeps its 16,000-token limit, which its API requires (decision of commit c1388ece).
- Replies of the run itself are unchanged.
