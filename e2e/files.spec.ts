import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread's files", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("opens folders and files, and finds them open again after a reload", async ({ page }) => {
    await registerUser(page, "fil", "Files User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Files", exact: true }).click();
    const panel = page.getByRole("region", { name: "Files" });
    const tree = panel.getByRole("complementary");

    await expect(panel.getByText("Pick a file in the tree to read it.")).toBeVisible();
    await tree.getByRole("button", { name: "src" }).click();
    await tree.getByRole("button", { name: "greeting.ts" }).click();
    await expect(panel.getByText('return "hello, world";')).toBeVisible();
    await expect(panel.locator('[style*="--shiki-dark"]').first()).toBeVisible();
    await tree.getByRole("button", { name: "README.md" }).click();
    await expect(panel.getByText("# Notes")).toBeVisible();

    await page.reload();
    await expect(tree.getByRole("button", { name: "greeting.ts" })).toBeVisible();
    await tree.getByRole("button", { name: "greeting.ts" }).click();
    await expect(panel.getByText('return "hello, world";')).toBeVisible();

    await panel.getByLabel("Filter files").fill("greet");
    await expect(tree.getByRole("button", { name: "src/greeting.ts" })).toBeVisible();
    await expect(tree.getByRole("button", { name: "README.md" })).toHaveCount(0);

    await panel.getByLabel("Filter files").fill("");
    await panel.getByRole("button", { name: "Close README.md" }).click();
    await expect(panel.getByRole("button", { name: "Close README.md" })).toHaveCount(0);
  });

  test("shares its column with the other panels", async ({ page }) => {
    await registerUser(page, "fl2", "Files Two");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("button", { name: "Changes", exact: true }).click();
    await expect(page.getByRole("region", { name: "Files" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Changes" })).toBeVisible();
  });
});
