import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("connecting GitHub", () => {
  test("a person connects their own GitHub account and comes back to where they were", async ({
    page,
  }) => {
    await registerUser(page, "gh", "GitHub User");
    const before = await page.request.get("/api/github/user");
    expect(await before.json()).toEqual({
      connected: false,
      login: null,
    });

    await page.goto("/api/github/connect?next=/projects?back=here");

    await expect(page).toHaveURL(/\/projects\?back=here$/);
    const after = await page.request.get("/api/github/user");
    expect(await after.json()).toEqual({
      connected: true,
      login: "ada",
    });
  });
});

test.describe("Settings > GitHub", () => {
  test("shows the platform's app, and lets the person install it and connect their account", async ({
    page,
  }) => {
    await registerUser(page, "gh", "GitHub User");
    await page.goto("/settings/github");

    await expect(page.getByRole("link", { name: "Install on GitHub" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Connect GitHub" })).toBeVisible();
  });
});
