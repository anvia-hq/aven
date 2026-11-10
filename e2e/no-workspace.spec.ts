import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread the agent has not worked on yet", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("says there is no workspace in the Files panel, instead of a tree and a file picker", async ({
    page,
  }) => {
    await registerUser(page, "nws", "No Workspace User");
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_NO_WORKSPACE: "1" });
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Files", exact: true }).click();
    const panel = page.getByRole("region", { name: "Files" });

    await expect(panel.getByText("This thread has no workspace yet.")).toBeVisible();
    await expect(panel.getByText("Pick a file in the tree to read it.")).toHaveCount(0);
    await expect(panel.getByLabel("Filter files")).toHaveCount(0);
  });

  test("says so in the Terminal panel, with no Wake up button that could only fail", async ({
    page,
  }) => {
    await registerUser(page, "nwt", "No Workspace Terminal");
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_NO_WORKSPACE: "1",
      NO_SANDBOX: "1",
    });
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    const panel = page.getByRole("region", { name: "Terminal" });

    await expect(panel.getByText("This thread has no workspace yet")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Wake up" })).toHaveCount(0);
  });
});
