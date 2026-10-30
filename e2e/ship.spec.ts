import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("shipping a thread", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("opens a pull request, links to it, and ships again as an update", async ({ page }) => {
    await registerUser(page, "shp", "Ship User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await expect(page.getByRole("link", { name: /#7/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Ship", exact: true }).click();

    await expect(page.getByText("Pull request opened")).toBeVisible();
    await expect(page.getByRole("link", { name: /#7/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/pull/7",
    );
    await expect(page.getByRole("button", { name: "Update PR" })).toBeVisible();

    // It survives a reload, since it is kept on the thread.
    await page.reload();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible();

    await page.getByRole("button", { name: "Update PR" }).click();
    await expect(page.getByText("Pull request updated")).toBeVisible();
  });
});
