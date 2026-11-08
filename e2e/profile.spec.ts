import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("Settings > Profile", () => {
  test("the profile page is the person's own, with what they have done so far", async ({
    page,
  }) => {
    await registerUser(page, "profile", "Profile Person");
    await page.goto("/settings/profile");

    await expect(page.getByRole("heading", { name: "Profile Person" })).toBeVisible();
    await expect(page.getByText("@profileperson")).toBeVisible();
    const stats = page.getByRole("main").getByRole("definition");
    await expect(stats).toHaveCount(4);
    await expect(page.getByRole("main").getByText("Longest thread")).toBeVisible();
    await expect(page.getByRole("main").getByText("Current streak")).toBeVisible();
    await expect(page.getByRole("region", { name: "Activity" })).toContainText("No activity yet");
    await expect(page.getByRole("region", { name: "Tokens" })).toContainText(
      "Your first thread starts this chart.",
    );
  });

  test("the account form and the preferences live at General, which Settings opens", async ({
    page,
  }) => {
    await registerUser(page, "general", "General Person");

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/general$/);
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveValue("General Person");
    await expect(page.getByText("Appearance")).toBeVisible();

    await page.getByLabel("Name").fill("Renamed Person");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();

    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { name: "Renamed Person" })).toBeVisible();
  });
});
