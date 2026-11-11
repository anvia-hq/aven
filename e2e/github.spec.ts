import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("connecting GitHub", () => {
  test("a callback with a state made for someone else is refused", async ({ page }) => {
    await registerUser(page, "gh", "GitHub User");
    const response = await page.request.get(
      "/api/github/callback?installation_id=1&code=fake&state=forged.state",
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(422);
    const installations = await page.request.get("/api/github/installations");
    expect(await installations.json()).toEqual([]);
  });

  test("a person connects their own GitHub account and comes back to where they were", async ({
    page,
  }) => {
    await registerUser(page, "gh", "GitHub User");
    const before = await page.request.get("/api/github/user");
    expect(await before.json()).toEqual({
      connected: false,
      login: null,
      appKey: "platform",
    });

    await page.goto("/api/github/connect?next=/projects?back=here");

    await expect(page).toHaveURL(/\/projects\?back=here$/);
    const after = await page.request.get("/api/github/user");
    expect(await after.json()).toEqual({
      connected: true,
      login: "ada",
      appKey: "platform",
    });
  });

  test("will not send a person back to another site after connecting", async ({ page }) => {
    await registerUser(page, "gh", "GitHub User");
    const response = await page.request.get("/api/github/connect?next=https://evil.test/", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(422);
  });
});

test.describe("a workspace's GitHub App (decision 0123)", () => {
  test("shows the app the workspace uses, and lets its owner start one of its own", async ({
    page,
  }) => {
    await registerUser(page, "gh", "GitHub User");
    await page.goto("/settings/github");

    await expect(page.getByText("This workspace uses the platform's GitHub App")).toBeVisible();
    const manifest = await page.request.get("/api/github/app/manifest?scope=workspace");
    expect(manifest.ok()).toBe(true);
    const { postUrl } = (await manifest.json()) as { postUrl: string };
    expect(postUrl).toContain("/settings/apps/new?state=");
    await expect(page.getByRole("button", { name: "Create GitHub App" })).toBeVisible();
  });
});
