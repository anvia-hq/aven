import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

const API_URL = "http://localhost:8100";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("a person's photo", () => {
  test("is uploaded in the settings, shown where they appear, served to the app, and removed", async ({
    page,
  }) => {
    await registerUser(page, "photo", "Photo Person");
    await page.goto("/settings/general");
    const account = page.getByRole("heading", { name: "General" });
    await expect(account).toBeVisible();
    await expect(page.locator('[data-slot="avatar-image"]')).toHaveCount(0);

    await page
      .getByLabel("Photo")
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Photo saved")).toBeVisible();

    const image = page.locator('[data-slot="avatar-image"]').first();
    await expect(image).toHaveAttribute("src", /\/api\/users\/[^/]+\/avatar\?v=\d+/);
    const src = (await image.getAttribute("src"))!;
    const served = await page.request.get(src);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toMatch(/^image\/(webp|jpeg)$/);

    await page.reload();
    await expect(page.locator('[data-slot="avatar-image"]').first()).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Photo removed")).toBeVisible();
    await expect(page.locator('[data-slot="avatar-image"]')).toHaveCount(0);
    expect((await page.request.get(src)).status()).toBe(404);
  });

  test("refuses a file that is not an image", async ({ page }) => {
    await registerUser(page, "photo", "Photo Person");
    await page.goto("/settings/general");
    await page
      .getByLabel("Photo")
      .setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await expect(page.getByText("Could not save the photo")).toBeVisible();
    await expect(page.locator('[data-slot="avatar-image"]')).toHaveCount(0);
  });

  test("refuses an oversized upload before reading it", async ({ page }) => {
    await registerUser(page, "photo", "Photo Person");
    const response = await page.request.put(`${API_URL}/profile/avatar`, {
      data: Buffer.alloc(300 * 1024),
      headers: { "content-type": "image/png" },
    });
    expect(response.status()).toBe(422);
  });
});
