import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread's background tasks", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("lists what is running and what ended, shows the output and stops a server", async ({
    page,
  }) => {
    await registerUser(page, "bgt", "Background User");
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_PROCESSES: "1" });
    runner = child;
    await page.setViewportSize({ width: 1400, height: 760 });

    await page.goto(`/threads/${threadId}`);

    const card = page.getByRole("region", { name: "Background tasks" });
    await expect(card).toContainText("npm run dev");
    await expect(card).toContainText("Running for 3 minutes");
    await expect(card).toContainText("bun test");
    await expect(card).toContainText("Exited with code 1");
    await expect(card.getByRole("button", { name: /^Stop/ })).toHaveCount(1);

    await card
      .getByRole("button", { name: /npm run dev/ })
      .first()
      .click();
    await expect(card.getByLabel("Output of npm run dev")).toContainText(
      "ready on http://localhost:3000",
    );

    await card.getByRole("button", { name: "Stop npm run dev" }).click();
    await expect(card).toContainText("Stopped");
    await expect(card.getByRole("button", { name: /^Stop/ })).toHaveCount(0);
  });

  test("shows a chip under the conversation while a process runs and drops it when it stops", async ({
    page,
  }) => {
    await registerUser(page, "bgt", "Background User");
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_PROCESSES: "1" });
    runner = child;
    await page.setViewportSize({ width: 1400, height: 760 });

    await page.goto(`/threads/${threadId}`);

    const chip = page.locator('[data-role="background-chip"]');
    await expect(chip).toContainText("Running in the background: npm run dev");

    await page
      .getByRole("region", { name: "Background tasks" })
      .getByRole("button", { name: "Stop npm run dev" })
      .click();
    await expect(chip).toHaveCount(0, { timeout: 10_000 });
  });

  test("has no card while nothing has run in the background", async ({ page }) => {
    await registerUser(page, "bgt", "Background User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    await page.setViewportSize({ width: 1400, height: 760 });

    await page.goto(`/threads/${threadId}`);

    await expect(page.getByRole("region", { name: "Environment" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Background tasks" })).toHaveCount(0);
  });
});
