import { expect, test } from "@playwright/test";

import { registerPlatformOwner, registerUser } from "./helpers";

const leftovers = [
  {
    runtimeId: "11111111-1111-4111-8111-111111111111",
    name: "homelab",
    status: "ok",
    containers: [
      {
        ref: "c1",
        name: "aven-sandbox-gone",
        state: "exited",
        image: "ghcr.io/anvia-hq/aven-sandbox:0.5.14",
        thread: "t1",
        createdAt: "2026-11-01 10:00:00",
        reason: "Not running (exited)",
      },
    ],
    images: [
      {
        ref: "ghcr.io/anvia-hq/aven-sandbox:0.5.12",
        id: "i5",
        size: "3GB",
        createdAt: "2026-10-01",
        reason: "A sandbox image of an older release",
      },
    ],
  },
  {
    runtimeId: "22222222-2222-4222-8222-222222222222",
    name: "devscalelabs-1",
    status: "unsupported",
    containers: [],
    images: [],
  },
  {
    runtimeId: "33333333-3333-4333-8333-333333333333",
    name: "laptop",
    status: "offline",
    containers: [],
    images: [],
  },
];

test.describe("the Docker page of the platform owner", () => {
  test("lists each runner's leftovers, removes one or all, and is for owners only", async ({
    page,
    browser,
  }) => {
    await registerPlatformOwner(page, 1);
    const other = await browser.newContext();
    const stranger = await other.newPage();
    await registerUser(stranger, "stranger", "Stranger");
    expect((await stranger.request.get("/api/platform/leftovers")).status()).toBe(403);
    await stranger.goto("/settings/docker");
    await expect(stranger).toHaveURL(/\/settings\/general$/);
    await other.close();

    let removals: unknown[] = [];
    await page.route("**/api/platform/leftovers", (route) => route.fulfill({ json: leftovers }));
    await page.route("**/api/platform/leftovers/*/remove", (route) => {
      removals.push({ url: route.request().url(), body: route.request().postDataJSON() });
      return route.fulfill({
        json: { removedContainers: 1, removedImages: 0, failed: [] },
      });
    });

    await page.goto("/settings/docker");
    const homelab = page.getByRole("list", { name: "Leftovers of homelab" });
    await expect(homelab.getByRole("listitem")).toHaveCount(2);
    await expect(page.getByText("run aven update on its machine")).toBeVisible();
    await expect(page.getByText("The runner is offline.")).toBeVisible();

    await page.getByRole("button", { name: "Remove container aven-sandbox-gone" }).click();
    await expect(page.getByText("Removed 1 container")).toBeVisible();
    expect(removals.at(-1)).toMatchObject({
      body: { containers: ["c1"], images: [] },
    });
    expect((removals.at(-1) as { url: string }).url).toContain(leftovers[0]?.runtimeId);

    removals = [];
    await page.getByRole("button", { name: "Remove all" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove all" }).click();
    await expect.poll(() => removals.length).toBe(1);
    expect(removals[0]).toMatchObject({
      body: { containers: ["c1"], images: ["ghcr.io/anvia-hq/aven-sandbox:0.5.12"] },
    });
  });
});
