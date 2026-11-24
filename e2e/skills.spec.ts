import { expect, test, type Page } from "@playwright/test";

import { registerUser } from "./helpers";

const toast = (page: Page, text: string) =>
  page.locator("[data-slot=toast]").filter({ hasText: text }).first();

test.describe("Settings > Skills", () => {
  test("installs the skills of a link, more than one, and leaves the ones it installed picked", async ({
    page,
  }) => {
    await registerUser(page, "skills", "Skills Person");
    await page.goto("/settings/skills");

    const yours = page.getByRole("region", { name: "Yours" });
    await expect(yours).toContainText("Upload folder");

    await page.getByLabel("A skill to install").fill("acme/agent-skills");
    await page.getByRole("button", { name: "Install", exact: true }).click();

    await expect(
      page.getByText("That repository has 2 skills. Install the ones you want:"),
    ).toBeVisible();

    await page.getByRole("button", { name: "design-review", exact: true }).click();
    await expect(toast(page, "Skill installed")).toBeVisible();
    await expect(yours).toContainText("design-review");
    await expect(yours).toContainText("2 files");

    await expect(page.getByRole("button", { name: "design-review", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "release", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "release", exact: true }).click();
    await expect(yours).toContainText("release");
    await expect(page.getByRole("button", { name: "release", exact: true })).toBeDisabled();
  });

  test("refuses a folder on a computer and points at the upload above it", async ({ page }) => {
    await registerUser(page, "skills-path", "Skills Path Person");
    await page.goto("/settings/skills");

    await page.getByLabel("A skill to install").fill("./my-skill");
    await page.getByRole("button", { name: "Install", exact: true }).click();

    await expect(toast(page, "Could not install skill")).toContainText(
      "A folder on a computer is uploaded, not installed from its path",
    );
  });
});
