import { afterAll, describe, expect, test } from "bun:test";

import { CodexLoginMissingError } from "./service";

const run =
  process.env.DATABASE_URL && process.env.PROVIDER_ENCRYPTION_KEY ? describe : describe.skip;

const access = "eyJhbGciOiJub25lIn0.payload.signature";
const login = JSON.stringify({
  tokens: { access_token: access, refresh_token: "refresh-token-value-9988" },
});

run("codexSetupService (postgres)", async () => {
  const { seedOrgPair } = await import("../../testing/seed-org-pair");
  const { codexSetupService } = await import("./service");
  const { userId, cleanup } = await seedOrgPair();

  afterAll(cleanup);

  test("stores the login encrypted and never returns it", async () => {
    expect(await codexSetupService.view(userId)).toEqual({ configured: false });
    const saved = await codexSetupService.save(userId, { login });
    expect(saved).toEqual({ configured: true, hint: access.slice(-4) });
    expect(JSON.stringify(saved)).not.toContain(access);
    expect(await codexSetupService.requireFor(userId)).toBe(login);

    const replaced = "eyJhbGciOiJub25lIn0.another.signature";
    expect(await codexSetupService.save(userId, { login: replaced })).toEqual({
      configured: true,
      hint: replaced.slice(-4),
    });
    expect(await codexSetupService.requireFor(userId)).toBe(replaced);

    expect(await codexSetupService.remove(userId)).toBe(true);
    expect(await codexSetupService.view(userId)).toEqual({ configured: false });
    await expect(codexSetupService.requireFor(userId)).rejects.toBeInstanceOf(
      CodexLoginMissingError,
    );
  });
});
