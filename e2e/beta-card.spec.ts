import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test("the beta card shows until the person dismisses it, and stays gone after a reload", async ({
  page,
}) => {
  await registerUser(page, "beta", "Beta User");
  await page.goto("/threads");
  const card = page.getByRole("region", { name: "Beta notice" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  await expect(card).toHaveCount(0);
  const saved = await page.request.get("/api/preferences");
  expect((await saved.json()).dismissedNotices).toEqual(["beta"]);
});

test("the beta card stays while the person moves between sections", async ({ page }) => {
  await registerUser(page, "beta3", "Beta Three");
  await page.goto("/threads");
  const card = page.getByRole("region", { name: "Beta notice" });
  await expect(card).toBeVisible();
  await page.evaluate(() => {
    const present = () => document.querySelector('[aria-label="Beta notice"]') !== null;
    const seen = { vanished: 0, was: present() };
    Object.assign(window, { betaSeen: seen });
    new MutationObserver(() => {
      const now = present();

      if (seen.was && !now) seen.vanished += 1;

      seen.was = now;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await page.getByRole("link", { name: "Aven" }).first().click();
  await expect(page).toHaveURL(/\/threads/);
  await expect(card).toBeVisible();
  const vanished = await page.evaluate(
    () => (window as unknown as { betaSeen: { vanished: number } }).betaSeen.vanished,
  );
  expect(vanished).toBe(0);
});
