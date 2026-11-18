import { expect, test } from "@playwright/test";

import { connectGithub, registerUser } from "./helpers";

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

test.describe("a repository Aven makes for a project", () => {
  test("becomes a project from Add project, with no computer", async ({ page }) => {
    await registerUser(page, "newrepo", "New Repo Person");
    await connectGithub(page);

    await page.getByRole("button", { name: "Add project" }).click();
    await page.getByRole("tab", { name: "New repository" }).click();
    await page.getByLabel("Name").fill("fresh-app");
    await page.getByRole("button", { name: "Create and add" }).click();

    const projects = page.getByRole("region", { name: "Project list" });
    await expect(projects.getByRole("link", { name: /^fresh-app/ })).toBeVisible();
  });
});

test.describe("Settings > GitHub", () => {
  test("shows the platform's app, and lets the person install it and connect their account", async ({
    page,
  }) => {
    await registerUser(page, "gh", "GitHub User");
    await page.goto("/settings/github");

    await expect(page.getByRole("button", { name: "Install on GitHub" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
  });
});
