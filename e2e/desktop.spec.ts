import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

// The desktop panel opens when asked for, from the thread's toolbar.
async function openDesktop(page: Page, threadId: string) {
  await page.goto(`/threads/${threadId}`);
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
}

test.describe("a thread's desktop", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("keeps the panel sizes and whether the desktop is open", async ({ page }) => {
    await registerUser(page, "per", "Persist User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await openDesktop(page, threadId);
    const panel = page.getByRole("region", { name: "Desktop" });
    await expect(panel).toBeVisible();
    const width = () => panel.evaluate((el) => Math.round(el.getBoundingClientRect().width));
    const before = await width();

    const box = (await page.getByRole("separator").last().boundingBox())!;
    await page.mouse.move(box.x + 1, 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, 300, { steps: 8 });
    await page.mouse.up();
    const resized = await width();
    expect(resized).toBeLessThan(before - 100);

    await page.reload();
    await expect(panel).toBeVisible();
    expect(Math.abs((await width()) - resized)).toBeLessThan(8);

    await page.getByRole("button", { name: "Close desktop" }).click();
    await page.reload();
    await page.getByLabel("Prompt").waitFor();
    await expect(panel).toHaveCount(0);
  });

  test("is watched read-only, and a click only reaches it after taking over", async ({ page }) => {
    await registerUser(page, "dsk", "Desktop User");
    const { child, events, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await openDesktop(page, threadId);
    const panel = page.getByRole("region", { name: "Desktop" });
    await expect(panel.getByText("Watching. Take over to click and type.")).toBeVisible();

    // The pretend desktop is all red; noVNC draws it on a canvas.
    const canvas = panel.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(async () => {
      const pixel = await canvas.evaluate((element) => {
        const context = (element as HTMLCanvasElement).getContext("2d")!;
        return Array.from(context.getImageData(10, 10, 1, 1).data);
      });
      expect(pixel).toEqual([255, 0, 0, 255]);
    }).toPass({ timeout: 10_000 });

    // Watching sends nothing to the desktop.
    await canvas.click({ position: { x: 50, y: 50 } });
    await page.waitForTimeout(500);
    expect(events.filter((entry) => entry.type === "pointer")).toEqual([]);

    await panel.getByRole("button", { name: "Take over" }).click();
    await expect(
      panel.getByText("You are in control. The agent's inputs are paused."),
    ).toBeVisible();
    await expect.poll(() => events.some((entry) => entry.type === "takeover")).toBe(true);

    await canvas.click({ position: { x: 50, y: 50 } });
    await expect.poll(() => events.some((entry) => entry.type === "pointer")).toBe(true);

    await panel.getByRole("button", { name: "Give back" }).click();
    await expect(panel.getByText("Watching. Take over to click and type.")).toBeVisible();
    await expect.poll(() => events.some((entry) => entry.type === "release")).toBe(true);
  });

  test("says when the thread's sandbox is not running", async ({ page }) => {
    await registerUser(page, "dsk", "Desktop User");
    const { child, threadId } = await threadOnFakeRunner(page, { NO_SANDBOX: "1" });
    runner = child;

    await openDesktop(page, threadId);

    const panel = page.getByRole("region", { name: "Desktop" });
    await expect(panel.getByText("The thread's sandbox is not running.")).toBeVisible();
    await expect(panel.locator("canvas")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Take over" })).toHaveCount(0);
  });

  test("can be opened and closed again from the thread header", async ({ page }) => {
    await registerUser(page, "dsk", "Desktop User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.goto(`/threads/${threadId}`);
    const toggle = page.getByRole("button", { name: "Desktop", exact: true });
    await expect(page.getByRole("region", { name: "Desktop" })).toHaveCount(0);

    await toggle.click();
    await expect(page.getByRole("region", { name: "Desktop" })).toBeVisible();
    await toggle.click();
    await expect(page.getByRole("region", { name: "Desktop" })).toHaveCount(0);
  });
});
