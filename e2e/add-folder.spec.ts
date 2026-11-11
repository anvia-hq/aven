import { expect, test } from "@playwright/test";
import type { ChildProcess } from "node:child_process";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("adding a folder", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("picks a folder by browsing the computer, and makes a new one", async ({ page }) => {
    await registerUser(page, "folder", "Folder Person");
    const started = await threadOnFakeRunner(page, { FAKE_DIRS: "/work/code" });
    runner = started.child;

    await page.goto("/projects");
    await page.getByRole("button", { name: "Add a folder" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a folder" });
    await expect(dialog.getByRole("button", { name: "Add", exact: true })).toBeDisabled();

    await dialog.getByRole("button", { name: "code" }).click();
    await expect(dialog.getByText("/work/code", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "notes" })).toBeVisible();

    await dialog.getByRole("button", { name: "New folder" }).click();
    await dialog.getByLabel("Name of the new folder").fill("fresh");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog.getByText("/work/code/fresh", { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Up one folder" }).click();
    await dialog.getByRole("button", { name: "notes" }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.getByText("Folder added")).toBeVisible();
    await expect(page.getByRole("link", { name: /notes/ })).toBeVisible();
  });
});
