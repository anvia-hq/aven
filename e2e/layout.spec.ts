import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test("the sidebar is resized by dragging its edge, and keeps its width", async ({ page }) => {
  await registerUser(page, "lay", "Layout User");
  await page.setViewportSize({ width: 1280, height: 720 });
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  const width = () =>
    sidebar.evaluate((element) => Math.round(element.getBoundingClientRect().width));
  await expect.poll(width).toBe(240);
  await expect(page.getByRole("button", { name: "Toggle Sidebar" })).toHaveCount(0);

  const box = (await page.getByRole("separator", { name: "Resize sidebar" }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, 300);
  await page.mouse.down();
  await page.mouse.move(360, 300, { steps: 6 });
  await page.mouse.up();
  await expect.poll(width).toBe(360);

  await page.reload();
  await expect.poll(width).toBe(360);
});
