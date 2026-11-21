import { describe, expect, test } from "bun:test";

import { parseCodexAuth } from "@aven/protocol/codex-auth";
import { createCodexDevice } from "./device-auth";

const claims = Buffer.from(
  JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acct-1" } }),
).toString("base64url");
const idToken = `h.${claims}.s`;

const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("codex device sign-in", () => {
  test("starts with the Codex client and returns the code to enter", async () => {
    const calls: { url: string; body: string }[] = [];
    const device = createCodexDevice((async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return answer(200, { device_auth_id: "d1", user_code: "ABCD-12345", interval: "5" });
    }) as unknown as typeof fetch);
    const code = await device.start();
    expect(code).toMatchObject({
      deviceAuthId: "d1",
      userCode: "ABCD-12345",
      verificationUrl: "https://auth.openai.com/codex/device",
      intervalSeconds: 5,
    });
    expect(calls[0]!.url).toBe("https://auth.openai.com/api/accounts/deviceauth/usercode");
    expect(calls[0]!.body).toContain("app_EMoamEEZ73f0CkXaXp7hrann");
  });

  test("a 403 means the person has not approved yet", async () => {
    const device = createCodexDevice((async () =>
      answer(403, {
        error: { code: "deviceauth_authorization_pending" },
      })) as unknown as typeof fetch);
    expect(await device.poll("d1", "ABCD")).toEqual({ status: "pending" });
  });

  test("an approval is exchanged for an auth.json Codex can read", async () => {
    const urls: string[] = [];
    const device = createCodexDevice(
      (async (url: string) => {
        urls.push(url);
        return url.endsWith("/token") && url.includes("deviceauth")
          ? answer(200, { authorization_code: "c", code_challenge: "x", code_verifier: "v" })
          : answer(200, { id_token: idToken, access_token: "a", refresh_token: "r" });
      }) as unknown as typeof fetch,
      () => new Date("2026-01-01T00:00:00Z"),
    );
    const done = await device.poll("d1", "ABCD");
    expect(done.status).toBe("done");
    const auth = parseCodexAuth(done.status === "done" ? done.auth : "")!;
    expect(auth.tokens).toMatchObject({
      access_token: "a",
      refresh_token: "r",
      account_id: "acct-1",
    });
    expect(urls[1]).toBe("https://auth.openai.com/oauth/token");
  });
});
