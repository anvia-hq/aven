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

test("the beta card is shown to a new person", async ({ page }) => {
  await registerUser(page, "beta2", "Beta Two");
  await page.goto("/threads");
  await expect(page.getByRole("region", { name: "Beta notice" })).toBeVisible();
});
