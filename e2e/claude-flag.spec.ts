import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("the Claude agent flag", () => {
  test("is on by default, so the Providers page offers a Claude subscription", async ({ page }) => {
    await registerUser(page, "claudeon", "Claude On");
    const config = (await (await page.request.get("/api/platform/config")).json()) as {
      claudeBackend: boolean;
    };
    expect(config.claudeBackend).toBe(true);

    await page.goto("/settings/providers");
    await expect(
      page.getByRole("listitem", { name: "Claude subscription", exact: true }),
    ).toBeVisible();
  });

  test("when it is off, the Providers page leaves Claude out", async ({ page }) => {
    await registerUser(page, "claudeoff", "Claude Off");
    await page.route("**/api/platform/config", async (route) => {
      const real = await route.fetch();
      await route.fulfill({ json: { ...(await real.json()), claudeBackend: false } });
    });

    await page.goto("/settings/providers");
    await expect(page.getByRole("listitem", { name: "Anthropic", exact: true })).toBeVisible();
    await expect(
      page.getByRole("listitem", { name: "Claude subscription", exact: true }),
    ).toHaveCount(0);
  });
});
