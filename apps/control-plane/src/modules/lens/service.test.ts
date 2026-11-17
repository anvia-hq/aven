import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { db } from "@aven/db/client";
import { platformSettings } from "@aven/db/schema/platform-settings";
import { eq } from "drizzle-orm";

import { keepPlatformSettings } from "../../testing/kept-platform-settings";
import { lensSettingsService } from "./service";

keepPlatformSettings(["lens_settings"], { cleared: true });

const before = process.env.AVEN_LENS;

beforeAll(() => {
  process.env.AVEN_LENS = "on";
});

afterAll(() => {
  if (before === undefined) delete process.env.AVEN_LENS;
  else process.env.AVEN_LENS = before;
});

describe("the Anvia Lens settings", () => {
  test("what is saved here is what a run carries, with the secret kept back", async () => {
    const saved = await lensSettingsService.save({
      baseUrl: "https://lens.example.com/",
      publicKey: "pk_lens_public",
      secretKey: "sk_lens_secret_key",
      captureMode: "full",
    });

    expect(saved).toEqual({
      baseUrl: "https://lens.example.com",
      publicKey: "pk_lens_public",
      keyHint: "_key",
      captureMode: "full",
    });

    const [row] = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, "lens_settings"));

    expect(row?.value).not.toContain("sk_lens_secret_key");
    expect(await lensSettingsService.forRun()).toEqual({
      baseUrl: "https://lens.example.com",
      publicKey: "pk_lens_public",
      secretKey: "sk_lens_secret_key",
      captureMode: "full",
    });
  });

  test("saving without a secret keeps the one already saved", async () => {
    await lensSettingsService.save({
      baseUrl: "https://other.example.com",
      publicKey: "pk_lens_public",
      captureMode: "safe",
    });

    expect(await lensSettingsService.forRun()).toMatchObject({
      baseUrl: "https://other.example.com",
      secretKey: "sk_lens_secret_key",
      captureMode: "safe",
    });
  });

  test("the first save without a secret is refused", async () => {
    await lensSettingsService.remove();

    await expect(
      lensSettingsService.save({
        baseUrl: "https://lens.example.com",
        publicKey: "pk_lens_public",
        captureMode: "safe",
      }),
    ).rejects.toThrow("secret key");
  });

  test("the address must be a plain http or https one", async () => {
    await expect(
      lensSettingsService.save({
        baseUrl: "nope",
        publicKey: "pk",
        secretKey: "sk",
        captureMode: "safe",
      }),
    ).rejects.toThrow("must be a plain http or https address");
    await expect(
      lensSettingsService.save({
        baseUrl: "https://lens.example.com/v1?x=1",
        publicKey: "pk",
        secretKey: "sk",
        captureMode: "safe",
      }),
    ).rejects.toThrow("must be a plain http or https address");
  });

  test("removing what is not saved says so", async () => {
    await expect(lensSettingsService.remove()).rejects.toThrow(
      "No Anvia Lens settings are saved here",
    );
  });
});

describe("the Anvia Lens flag", () => {
  test("a run carries the settings only while the flag is on", async () => {
    await lensSettingsService.save({
      baseUrl: "https://lens.example.com",
      publicKey: "pk_lens_public",
      secretKey: "sk_lens_secret_key",
      captureMode: "safe",
    });

    expect(await lensSettingsService.forRun()).toMatchObject({
      baseUrl: "https://lens.example.com",
    });

    process.env.AVEN_LENS = "off";

    expect(await lensSettingsService.forRun()).toBeUndefined();

    process.env.AVEN_LENS = "on";

    expect(await lensSettingsService.forRun()).toMatchObject({
      baseUrl: "https://lens.example.com",
    });
  });
});
