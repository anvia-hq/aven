import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

// The overview's Background tasks card (decision 0071), against the pretend runner's processes
// (e2e/fake-runner.ts, FAKE_PROCESSES).
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
    // Only what is running can be stopped.
    await expect(card.getByRole("button", { name: /^Stop/ })).toHaveCount(1);

    // The output opens under its command.
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
