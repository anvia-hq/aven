import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread's terminal", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("runs what is typed in the sandbox and shows what comes back", async ({ page }) => {
    await registerUser(page, "trm", "Terminal User");
    const { child, events, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    const panel = page.getByRole("region", { name: "Terminal" });
    await expect(panel.locator(".xterm-rows")).toContainText("fake$");
    await expect.poll(() => events.some((entry) => entry.type === "terminal.open")).toBe(true);

    await panel.locator(".xterm").click();
    await page.keyboard.type("echo hi");
    await page.keyboard.press("Enter");
    await expect(panel.locator(".xterm-rows")).toContainText("ran: echo hi");

    const before = events.filter((entry) => entry.type === "terminal.resize").length;
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect
      .poll(() => events.filter((entry) => entry.type === "terminal.resize").length)
      .toBeGreaterThan(before);
  });

  test("offers to wake a sandbox that is off, and opens a shell in it", async ({ page }) => {
    await registerUser(page, "trw", "Terminal Wake User");
    const { child, threadId } = await threadOnFakeRunner(page, { NO_SANDBOX: "1" });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    const panel = page.getByRole("region", { name: "Terminal" });
    await panel.getByRole("button", { name: "Start" }).click();
    await expect(panel.locator(".xterm-rows")).toContainText("fake$");
  });
});
