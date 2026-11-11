import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread's changes", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("shows the last turn or the full diff, unified or split, and remembers the choice", async ({
    page,
  }) => {
    await registerUser(page, "dif", "Diff User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Changes", exact: true }).click();
    const panel = page.getByRole("region", { name: "Changes" });

    await expect(panel.getByText("src/greeting.ts")).toBeVisible();
    await expect(panel.getByText("1 file")).toBeVisible();
    await expect(panel.getByText('return "hello, world";')).toBeVisible();
    await expect(panel.getByText("README.md")).toHaveCount(0);

    await panel.getByRole("tab", { name: "Full diff" }).click();
    await expect(panel.getByText("README.md")).toBeVisible();
    await expect(panel.getByText("2 files")).toBeVisible();

    await panel.getByRole("tab", { name: "Split" }).click();
    await expect(panel.locator(".grid-cols-2").first()).toBeVisible();

    await page.reload();
    await expect(panel.getByRole("tab", { name: "Full diff" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(panel.locator(".grid-cols-2").first()).toBeVisible();

    await page.getByRole("button", { name: "Close changes" }).click();
    await expect(panel).toHaveCount(0);
  });

  test("the changes badge opens the panel on the same unshipped changes", async ({ page }) => {
    await registerUser(page, "bad", "Badge User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    const badge = page.getByTitle("Changes not shipped yet");
    await expect(badge).toHaveText("+2 -1");

    await badge.click();

    const panel = page.getByRole("region", { name: "Changes" });
    await expect(panel.getByRole("tab", { name: "Unshipped" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(panel.getByText("2 files")).toContainText("+2 -1");
  });

  test("shares its width with the terminal, so switching between them does not move the edge", async ({
    page,
  }) => {
    await registerUser(page, "wid", "Width User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Changes", exact: true }).click();
    const changes = page.getByRole("region", { name: "Changes" });
    const terminal = page.getByRole("region", { name: "Terminal" });
    const width = (region: typeof changes) =>
      region.evaluate((el) => Math.round(el.getBoundingClientRect().width));

    const box = (await page.getByRole("separator").last().boundingBox())!;
    await page.mouse.move(box.x + 1, 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, 300, { steps: 8 });
    await page.mouse.up();
    const resized = await width(changes);

    await page.getByRole("button", { name: "Close changes" }).click();
    await page.getByRole("button", { name: "Terminal", exact: true }).click();
    await expect(terminal).toBeVisible();
    expect(Math.abs((await width(terminal)) - resized)).toBeLessThan(8);
  });
});
