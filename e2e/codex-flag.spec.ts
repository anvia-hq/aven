import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("the Codex agent flag", () => {
  test("is on by default, so the Providers page offers a Codex subscription", async ({ page }) => {
    await registerUser(page, "codexon", "Codex On");
    const config = (await (await page.request.get("/api/platform/config")).json()) as {
      codexBackend: boolean;
    };
    expect(config.codexBackend).toBe(true);

    await page.goto("/settings/providers");
    await expect(
      page.getByRole("listitem", { name: "Codex subscription", exact: true }),
    ).toBeVisible();
  });

  test("when it is off, the Providers page leaves Codex out", async ({ page }) => {
    await registerUser(page, "codexoff", "Codex Off");
    await page.route("**/api/platform/config", async (route) => {
      const real = await route.fetch();
      await route.fulfill({ json: { ...(await real.json()), codexBackend: false } });
    });

    await page.goto("/settings/providers");
    await expect(page.getByRole("listitem", { name: "OpenAI", exact: true })).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "Codex subscription", exact: true }),
    ).toHaveCount(0);
  });
});
