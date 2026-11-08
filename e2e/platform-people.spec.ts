import { expect, test } from "@playwright/test";

import { registerPlatformOwner, registerUser } from "./helpers";

test.describe("the platform owner's people page", () => {
  test("shows accounts that are in none of the owner's workspaces, only to an owner, and removes one", async ({
    page,
    browser,
  }) => {
    await registerPlatformOwner(page, 0);
    const other = await browser.newContext();
    const outsider = await other.newPage();
    const outsiderEmail = await registerUser(outsider, "outsider", "Outside Person");

    expect((await outsider.request.get("/api/platform/users")).status()).toBe(403);
    await outsider.goto("/settings/people");
    await expect(outsider).toHaveURL(/\/settings\/general$/);

    await page.goto("/settings/people");
    const people = page.getByRole("list", { name: "People" });
    const row = people.getByRole("listitem").filter({ hasText: outsiderEmail });
    await expect(row).toContainText("Outside Person");
    await expect(
      people.getByRole("listitem").filter({ hasText: "Platform Owner 0" }),
    ).toContainText("Owner");
    await expect(
      people.getByRole("listitem").filter({ hasText: "Platform Owner 0" }),
    ).not.toContainText("Remove");
    await expect(
      page.getByRole("button", { name: "Remove account of Platform Owner 0" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Remove account of Outside Person" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove account" }).click();
    await expect(row).toHaveCount(0);
    await expect.poll(async () => (await outsider.request.get("/api/threads")).status()).toBe(401);
    await other.close();
  });
});
