import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

async function useDomTerminalRenderer(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl" || type === "webgl2") return null;

      return original.call(this, type as "2d", ...(args as [CanvasRenderingContext2DSettings?]));
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

test.describe("a thread's terminal", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("runs what is typed in the sandbox and shows what comes back", async ({ page }) => {
    await useDomTerminalRenderer(page);
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
    await useDomTerminalRenderer(page);
    await registerUser(page, "trw", "Terminal Wake User");
    const { child, threadId } = await threadOnFakeRunner(page, { NO_SANDBOX: "1" });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    const panel = page.getByRole("region", { name: "Terminal" });
    await panel.getByRole("button", { name: "Start" }).click();
    await expect(panel.locator(".xterm-rows")).toContainText("fake$");
  });

  test("mounts the WebGL renderer and loads the Nerd Font symbol fallback", async ({ page }) => {
    await registerUser(page, "trgl", "Terminal WebGL User");
    const { child, events, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    const panel = page.getByRole("region", { name: "Terminal" });
    await expect.poll(() => events.some((entry) => entry.type === "terminal.open")).toBe(true);
    await expect(panel.locator(".xterm-screen canvas").first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.fonts].some(
            (font) => font.family.includes("Symbols Nerd Font Mono") && font.status === "loaded",
          ),
        ),
      )
      .toBe(true);
  });
});
