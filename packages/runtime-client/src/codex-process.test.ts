import { describe, expect, test } from "bun:test";

import { codexProcessEnv } from "./codex-process";

const access = "eyJhbGciOiJub25lIn0.payload.signature";
const refresh = "refresh-token-value-9988";

describe("the Codex process environment", () => {
  test("passes the access token in memory and drops provider keys", () => {
    const login = JSON.stringify({
      tokens: { access_token: access, refresh_token: refresh },
    });
    const env = codexProcessEnv(
      { PATH: "/usr/bin", HOME: "/tmp", OPENAI_API_KEY: "sk-test", CODEX_API_KEY: "sk-codex" },
      "/tmp/codex-home",
      login,
    );

    expect(env.CODEX_ACCESS_TOKEN).toBe(access);
    expect(env.CODEX_HOME).toBe("/tmp/codex-home");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.CODEX_API_KEY).toBeUndefined();
    expect(Object.values(env).join("\n")).not.toContain(refresh);
  });
});
