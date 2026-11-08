import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

async function registerOwner(page: import("@playwright/test").Page) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Platform Owner");
  await page.getByLabel("Email").fill(process.env.E2E_PLATFORM_OWNER ?? "");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
}

test.describe("the platform owner's people list", () => {
  test("shows accounts that are in none of the owner's workspaces, and only to an owner", async ({
    page,
    browser,
  }) => {
    await registerOwner(page);
    const other = await browser.newContext();
    const outsider = await other.newPage();
    const outsiderEmail = await registerUser(outsider, "outsider", "Outside Person");

    expect((await outsider.request.get("/api/platform/users")).status()).toBe(403);
    await outsider.goto("/settings/platform");
    await expect(outsider).toHaveURL(/\/settings\/profile$/);

    await page.goto("/settings/platform");
    const people = page.getByRole("list", { name: "People" });
    const row = people.getByRole("listitem").filter({ hasText: outsiderEmail });
    await expect(row).toContainText("Outside Person");
    await expect(people.getByRole("listitem").filter({ hasText: "Platform Owner" })).toContainText(
      "Owner",
    );
    await other.close();
  });
});
