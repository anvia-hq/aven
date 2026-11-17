import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("the Anvia Lens flag", () => {
  test("is off unless the server turns it on, and on Installation it offers the form", async ({
    page,
  }) => {
    await registerUser(page, "lensflag", "Lens Flag");
    let lens = false;

    await page.route("**/api/platform/config", async (route) => {
      const real = await route.fetch();
      await route.fulfill({ json: { ...(await real.json()), isOwner: true, lens } });
    });
    await page.route("**/api/platform/lens", (route) => route.fulfill({ json: null }));

    await page.goto("/settings/platform");
    await expect(page.getByRole("heading", { name: "Installation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Anvia Lens" })).toHaveCount(0);

    lens = true;
    await page.goto("/settings/platform");

    const section = page.getByRole("region", { name: "Anvia Lens" });
    await expect(section).toBeVisible();
    await expect(section.getByLabel("Lens address")).toBeVisible();
    await expect(section.getByLabel("Public key")).toBeVisible();
    await expect(section.getByLabel("Secret key")).toBeVisible();
  });
});
