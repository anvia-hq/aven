import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("renaming a thread", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("a double click on its title in the sidebar makes it a field; Enter keeps the new title, Escape the old", async ({
    page,
  }) => {
    await registerUser(page, "ren", "Rename User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    await page.setViewportSize({ width: 1400, height: 760 });
    await page.goto(`/threads/${threadId}`);

    const row = page.getByRole("link", { name: /shiny-app/ });
    await row.getByText("shiny-app").dblclick();
    const field = page.getByRole("textbox", { name: "Thread title" });
    await field.fill("Check the login flow");
    await field.press("Enter");
    await expect(page.getByRole("link", { name: /Check the login flow/ })).toBeVisible();

    // It is the server's too: it survives a reload.
    await page.reload();
    await expect(page.getByRole("link", { name: /Check the login flow/ })).toBeVisible();

    await page
      .getByRole("link", { name: /Check the login flow/ })
      .getByText("Check the login flow")
      .dblclick();
    await page.getByRole("textbox", { name: "Thread title" }).fill("Not this");
    await page.getByRole("textbox", { name: "Thread title" }).press("Escape");
    await expect(page.getByRole("link", { name: /Check the login flow/ })).toBeVisible();
    await expect(page.getByText("Not this")).toHaveCount(0);
  });
});
