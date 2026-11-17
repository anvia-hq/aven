import { expect, test } from "@playwright/test";

import { registerPlatformOwner, registerUser } from "./helpers";

test.describe("the platform owner's sandbox page", () => {
  test("keeps one sandbox platform, and clears the other's addresses when it changes", async ({
    page,
  }) => {
    await registerPlatformOwner(page, 0);
    await page.goto("/settings/sandbox");

    await page.getByLabel("Spaces server").fill("https://spaces.example.com/api/v1");
    await page.getByLabel("Address a sandbox dials (optional)").fill("http://192.168.1.10:8000");
    await page.getByLabel("API key").fill("spk_secret1234");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Sandbox platform: Spaces")).toBeVisible();
    await expect(page.getByText("https://spaces.example.com/api/v1")).toBeVisible();

    await page.getByRole("combobox", { name: "Sandbox platform" }).click();
    await page.getByRole("option", { name: "boat.dev", exact: true }).click();

    await expect(page.getByLabel("Boat API address (optional)")).toHaveValue("");
    await expect(page.getByLabel("Public address a sandbox dials")).toHaveValue("");
    await expect(page.getByLabel("API key")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

    await page.getByLabel("API key").fill("boat_abcd");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Sandbox platform: boat.dev", { exact: true })).toBeVisible();
    await expect(page.getByText("Sandbox platform: Spaces")).toHaveCount(0);
  });

  test("is not there for someone who is not an owner of this installation", async ({ browser }) => {
    const other = await browser.newContext();
    const outsider = await other.newPage();
    await registerUser(outsider, "outsider", "Outside Person");

    expect((await outsider.request.get("/api/platform/cloud")).status()).toBe(403);
    await outsider.goto("/settings/sandbox");
    await expect(outsider).toHaveURL(/\/settings\/general$/);
    await other.close();
  });
});
