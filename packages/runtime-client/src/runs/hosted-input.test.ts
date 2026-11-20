import { describe, expect, test } from "bun:test";

import { createHostedRunInput } from "./hosted-input";

describe("createHostedRunInput", () => {
  test("redacts claudeToken and secret project env vars", () => {
    const input = createHostedRunInput("claude", {
      token: "sk-claude-secret-token-1234",
      workspace: async () => "/tmp",
      env: [
        { name: "API_SECRET", value: "env-secret-value-5678", secret: true },
        { name: "PUBLIC_FLAG", value: "public-visible-flag", secret: false },
      ],
      tools: {},
    });

    const redacted = input.claude!.redact(
      "tok=sk-claude-secret-token-1234 env=env-secret-value-5678 pub=public-visible-flag",
    );
    expect(redacted).not.toContain("sk-claude-secret-token-1234");
    expect(redacted).not.toContain("env-secret-value-5678");
    expect(redacted).toContain("public-visible-flag");
  });

  test("redacts codexAuthSecrets and updates redaction when auth is renewed", () => {
    const initialAuth = JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token: "codex-access-secret-1111",
        refresh_token: "codex-refresh-secret-2222",
        id_token: "codex-id-secret-3333",
      },
    });
    const renewedAuth = JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token: "codex-access-renewed-4444",
        refresh_token: "codex-refresh-renewed-5555",
        id_token: "codex-id-renewed-6666",
      },
    });
    const saved: { previous: string; token: string }[] = [];
    const input = createHostedRunInput("codex", {
      token: initialAuth,
      workspace: async () => "/tmp",
      tools: {},
      caller: {
        call: async (_method, params) => {
          saved.push(params);
        },
      },
    });

    const before = input.codex!.redact(
      "a=codex-access-secret-1111 r=codex-refresh-secret-2222 i=codex-id-secret-3333",
    );
    expect(before).not.toContain("codex-access-secret-1111");
    expect(before).not.toContain("codex-refresh-secret-2222");
    expect(before).not.toContain("codex-id-secret-3333");

    input.codex!.renewed?.(renewedAuth, initialAuth);
    const after = input.codex!.redact(
      "old=codex-access-secret-1111 new=codex-access-renewed-4444 ref=codex-refresh-renewed-5555",
    );
    expect(after).not.toContain("codex-access-secret-1111");
    expect(after).not.toContain("codex-access-renewed-4444");
    expect(after).not.toContain("codex-refresh-renewed-5555");
    expect(saved).toEqual([{ previous: initialAuth, token: renewedAuth }]);
  });
});
