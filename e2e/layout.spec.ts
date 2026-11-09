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
  await page.mouse.move(56 + 360, 300, { steps: 6 });
  await page.mouse.up();
  await expect.poll(width).toBe(360);

  await page.reload();
  await expect.poll(width).toBe(360);
});

test("the rail has usable targets, keyboard tooltips and a current destination", async ({
  page,
}) => {
  await registerUser(page, "rail", "Rail User");
  const rail = page.getByRole("navigation", { name: "Aven", exact: true });
  const logo = rail.getByRole("link", { name: "Aven", exact: true });
  await expect(logo).toHaveAttribute("aria-current", "page");
  for (const link of await rail.getByRole("link").all()) {
    const box = (await link.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await logo.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(logo).toBeFocused();
  await expect(page.getByText("Aven · threads", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  const bot = rail.getByRole("link", { name: "Bot", exact: true });
  await expect(bot).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/bot$/);
  await expect(bot).toHaveAttribute("aria-current", "page");
  await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);

  await rail.getByRole("link", { name: "Cockpit", exact: true }).click();
  await expect(page).toHaveURL(/\/cockpit\/inbox$/);
  await expect(rail.locator('[aria-current="page"]')).toHaveAccessibleName("Cockpit");
  await page
    .getByRole("navigation", { name: "Cockpit", exact: true })
    .getByRole("link", { name: /Tasks/ })
    .click();
  await expect(rail.locator('[aria-current="page"]')).toHaveAccessibleName("Cockpit");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rail).toBeHidden();
  await expect(page.getByRole("button", { name: "Toggle Sidebar" })).toBeVisible();

  const apps = page.getByRole("navigation", { name: "Apps" });
  await expect(apps).toBeVisible();
  for (const link of await apps.getByRole("link").all()) {
    const box = (await link.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await apps.getByRole("link", { name: "Bot", exact: true }).click();
  await expect(page).toHaveURL(/\/bot$/);
  await expect(apps.getByRole("link", { name: "Bot", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await apps.getByRole("link", { name: "Cockpit", exact: true }).click();
  await expect(page).toHaveURL(/\/cockpit\/inbox$/);
  await expect(apps.locator('[aria-current="page"]')).toHaveAccessibleName("Cockpit");

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  const close = page.getByRole("button", { name: "Close navigation" });
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).toBeHidden();
});
