import { expect, test } from "@playwright/test";

import { registerPlatformOwner } from "./helpers";

test.describe("the Sprites sandbox platform", () => {
  test("is offered in Settings > Sandbox and saved as the platform's sandbox", async ({ page }) => {
    await registerPlatformOwner(page, 0);
    await page.goto("/settings/sandbox");

    await page.getByRole("combobox", { name: "Sandbox platform" }).click();
    await page.getByRole("option", { name: "Sprites", exact: true }).click();

    await expect(page.getByLabel("Sprites API address (optional)")).toHaveValue("");

    await page.getByLabel("API key").fill("anvia/org-id/token-id/secret");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("Sandbox platform: Sprites")).toBeVisible();
  });
});
