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

    await page
      .getByRole("link", { name: /Check the login flow/ })
      .getByText("Check the login flow")
      .dblclick();
    await page.getByRole("textbox", { name: "Thread title" }).fill("Check the signup flow");
    await page.getByRole("textbox", { name: "Thread title" }).press("Enter");
    await expect(page.getByRole("link", { name: /Check the signup flow/ })).toBeVisible();
    await page
      .getByRole("link", { name: /Check the signup flow/ })
      .getByText("Check the signup flow")
      .dblclick();
    await page.getByRole("textbox", { name: "Thread title" }).fill("Check the login flow");
    await page.getByRole("textbox", { name: "Thread title" }).press("Enter");
    await expect(page.getByRole("link", { name: /Check the login flow/ })).toBeVisible();

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

  test("Generate title in the thread menu says why when it cannot", async ({ page }) => {
    await registerUser(page, "gen", "Title User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    await page.setViewportSize({ width: 1400, height: 760 });
    await page.goto(`/threads/${threadId}`);

    await page.getByRole("button", { name: "Thread options" }).click();
    await page.getByRole("menuitem", { name: "Generate title" }).click();

    await expect(page.getByText("Could not generate a title")).toBeVisible();
    await expect(page.getByRole("link", { name: /shiny-app/ })).toBeVisible();
  });
});
