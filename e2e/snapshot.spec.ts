import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("taking a snapshot of a thread's environment", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("the Environment card has a Take snapshot button that runs the setup and says when it was saved", async ({
    page,
  }) => {
    await registerUser(page, "snap", "Snapshot Person");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);

    const card = page.getByRole("complementary", { name: "Overview" });
    const state = card.locator('[data-slot="snapshot-state"]');
    await expect(state).toHaveText("No snapshot yet");

    await card.getByRole("button", { name: "Take snapshot" }).click();
    await expect(state).toHaveText("Taking a snapshot…");
    await expect(card.getByRole("button", { name: "Taking…" })).toBeDisabled();
    await expect(state).toHaveText("Snapshot just now", { timeout: 10_000 });
    await expect(card.getByRole("button", { name: "Take snapshot" })).toBeEnabled();
  });

  test("shows the reason when the runner could not save one", async ({ page }) => {
    await registerUser(page, "snap", "Snapshot Person");
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_SNAPSHOT_FAILS:
        "The repository has no .aven/setup: write one, then save the environment",
    });
    runner = child;
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);

    const card = page.getByRole("complementary", { name: "Overview" });
    await card.getByRole("button", { name: "Take snapshot" }).click();
    await expect(page.getByText("Snapshot failed")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/has no \.aven\/setup/)).toBeVisible();
    await expect(card.locator('[data-slot="snapshot-state"]')).toHaveText("No snapshot yet");
  });
});
