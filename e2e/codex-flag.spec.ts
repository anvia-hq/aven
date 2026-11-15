import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("the Codex agent flag", () => {
  test("is on by default, so Codex is in Settings", async ({ page }) => {
    await registerUser(page, "codexon", "Codex On");
    const config = (await (await page.request.get("/api/platform/config")).json()) as {
      codexBackend: boolean;
    };
    expect(config.codexBackend).toBe(true);

    await page.goto("/settings/general");
    await expect(page.getByRole("link", { name: "Codex" })).toBeVisible();
  });

  test("when it is off, Settings leaves Codex out and says so", async ({ page }) => {
    await registerUser(page, "codexoff", "Codex Off");
    await page.route("**/api/platform/config", async (route) => {
      const real = await route.fetch();
      await route.fulfill({ json: { ...(await real.json()), codexBackend: false } });
    });

    await page.goto("/settings/general");
    await expect(page.getByRole("link", { name: "Providers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Codex" })).toHaveCount(0);

    await page.goto("/settings/codex");
    await expect(page.getByText("The Codex agent is turned off on this server")).toBeVisible();
  });
});
