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

    await dialog.getByRole("button", { name: "code" }).dblclick();
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

  test("a folder project's page lists its files, shows its README and its commits", async ({
    page,
  }) => {
    await registerUser(page, "folderpage", "Folder Page");
    const started = await threadOnFakeRunner(page, { FAKE_DIRS: "/work/code" });
    runner = started.child;

    await page.goto("/projects");
    await page.getByRole("button", { name: "Add a folder" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a folder" });
    await dialog.getByRole("button", { name: "code" }).dblclick();
    await dialog.getByRole("button", { name: "notes" }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("link", { name: /notes/ }).first().click();

    const files = page.getByRole("region", { name: "Files" });
    await expect(files.getByText("package.json")).toBeVisible();
    await expect(files.getByRole("link", { name: "src" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notes folder" })).toBeVisible();
    await expect(page.getByText("Kept on the computer.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Docs" })).toHaveCount(0);

    const commits = page.getByRole("region", { name: "Commits" });
    await expect(commits.getByText("Write the notes")).toBeVisible();
    await expect(commits.getByText("Start the notes folder")).toBeVisible();
    await expect(commits.getByText("v1")).toBeVisible();
    await expect(commits.getByRole("link")).toHaveCount(0);

    await files.getByRole("link", { name: "src" }).click();
    await expect(files.getByText("index.ts")).toBeVisible();
  });
});
