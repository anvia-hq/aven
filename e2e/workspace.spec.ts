import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const unique = () => `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;

async function register(page: Page) {
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill("Workspace User");
  await page.getByLabel("Email").fill(unique());
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
}

// A browser can't hand a page a real OS path, so "Project path" opens a folder browser backed
// by the server's filesystem; typing a path and pressing Enter browses straight to it.
async function chooseFolder(page: Page, path: string) {
  await page.getByRole("button", { name: /Choose a folder/ }).click();
  const pathField = page.getByLabel("Path");
  await pathField.fill(path);
  await pathField.press("Enter");
  await page.getByRole("button", { name: "Choose this folder" }).click();
}

test.describe("projects", () => {
  test("creates a project, lists it and opens it", async ({ page }) => {
    await register(page);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("shiny-app");
    await chooseFolder(page, process.cwd());
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByText("Project created")).toBeVisible();
    const list = page.getByRole("region", { name: "Project list" });
    await expect(list.getByRole("link")).toHaveCount(1);

    await list.getByRole("link", { name: "shiny-app" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expect(page.locator("header")).toContainText("shiny-app");
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "No threads in this project yet.",
    );

    // A cold reload re-fetches the project list; it must not flash "Project not found".
    await page.reload();
    await expect(page.locator("header")).toContainText("shiny-app");
    await expect(page.getByRole("heading", { name: "Project not found" })).toHaveCount(0);
  });

  test("creates a new folder from the picker and browses into it", async ({ page }) => {
    const dir = await mkdtemp(join(tmpdir(), "aven-new-folder-"));
    try {
      await register(page);
      await page.goto("/projects");
      await page.getByRole("button", { name: "New project" }).click();
      await page.getByLabel("Name").fill("fresh-project");
      await page.getByRole("button", { name: /Choose a folder/ }).click();
      const pathField = page.getByLabel("Path");
      await pathField.fill(dir);
      await pathField.press("Enter");

      await page.getByRole("button", { name: "New folder" }).click();
      await page.getByLabel("New folder name").fill("sub-project");
      await page.getByLabel("New folder name").press("Enter");
      await expect(page.getByRole("button", { name: "sub-project" })).toBeVisible();

      await page.getByRole("button", { name: "sub-project" }).click();
      await expect(page.getByText("No subfolders")).toBeVisible();
      await expect(pathField).toHaveValue(join(await realpath(dir), "sub-project"));

      // Creating the same folder again from a directory that already has it is rejected.
      await page.getByRole("button", { name: "Up" }).click();
      await page.getByRole("button", { name: "New folder" }).click();
      await page.getByLabel("New folder name").fill("sub-project");
      await page.getByLabel("New folder name").press("Enter");
      await expect(page.getByText("already exists")).toBeVisible();
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("starts a thread from the project page", async ({ page }) => {
    await register(page);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("shiny-app");
    await chooseFolder(page, process.cwd());
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("region", { name: "Project list" }).getByRole("link").click();

    await page.getByLabel("Prompt").fill("Explain the project layout");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Explain the project layout" })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "Explain the project layout",
    );
  });
});

test.describe("settings", () => {
  test("user menu opens personal and workspace settings", async ({ page }) => {
    await register(page);
    const footer = page.locator('[data-slot="sidebar-footer"]');

    await footer.getByRole("button", { name: /Workspace User/ }).click();
    await page.getByRole("menuitem", { name: /Personal settings/ }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    await footer.getByRole("button", { name: /Workspace User/ }).click();
    await page.getByRole("menuitem", { name: /Workspace settings/ }).click();
    await expect(page).toHaveURL(/\/settings\/members$/);
  });

  test("profile saves and the dark mode switch changes the theme", async ({ page }) => {
    await register(page);
    await page.goto("/settings/profile");
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();

    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("switch", { name: "Dark mode" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("settings navigation reaches every page", async ({ page }) => {
    await register(page);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/profile$/);

    const nav = page.getByRole("navigation", { name: "Settings" });
    for (const [name, url] of [
      ["API keys", /api-keys$/],
      ["Members", /members$/],
      ["Usage", /usage$/],
      ["Integrations", /integrations$/],
      ["Profile", /profile$/],
    ] as const) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
    }
  });

  test("invite and remove a member", async ({ page }) => {
    await register(page);
    await page.goto("/settings/members");
    const table = page.getByRole("table", { name: "Members" });
    await expect(table.getByRole("row")).toHaveCount(2);

    await page.getByRole("button", { name: "Invite member" }).click();
    await page.getByLabel("Email").fill("new.person@aven.test");
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(page.getByText("Invitation created")).toBeVisible();
    await expect(table.getByRole("row", { name: /new\.person@aven\.test/ })).toContainText(
      "Pending",
    );

    await page.getByRole("button", { name: "Remove new.person" }).click();
    await expect(table.getByText("new.person@aven.test")).toHaveCount(0);
  });

  test("create an API key, see the secret once, then revoke it", async ({ page }) => {
    await register(page);
    await page.goto("/settings/api-keys");
    const table = page.getByRole("table", { name: "API keys" });
    await expect(table.getByRole("row")).toHaveCount(4);

    await page.getByRole("button", { name: "Create key" }).click();
    await page.getByLabel("Name").fill("e2e key");
    await page.getByRole("button", { name: "Create key" }).last().click();

    await expect(page.getByTestId("new-api-key")).toHaveText(/^avn_[0-9a-f]{32}$/);
    await page.getByRole("button", { name: "Done" }).click();

    await expect(table.getByRole("row", { name: /e2e key/ })).toContainText("Never");
    await page.getByRole("button", { name: "Revoke e2e key" }).click();
    await expect(table.getByText("e2e key")).toHaveCount(0);
  });

  test("usage totals change with the range", async ({ page }) => {
    await register(page);
    await page.goto("/settings/usage");

    const totals = page.getByRole("region", { name: "Totals" });
    const before = await totals.innerText();
    await page.getByRole("button", { name: "7 days" }).click();
    await expect.poll(() => totals.innerText()).not.toBe(before);
    await expect(page.getByRole("img", { name: /over 7 days/ })).toBeVisible();
  });

  test("integrations can be connected and disconnected", async ({ page }) => {
    await register(page);
    await page.goto("/settings/integrations");

    const slack = page.getByRole("switch", { name: "Slack" });
    await expect(slack).not.toBeChecked();
    await slack.click();
    await expect(slack).toBeChecked();
    await expect(page.getByText("Slack connected")).toBeVisible();

    const github = page.getByRole("switch", { name: "GitHub" });
    await expect(github).toBeChecked();
    await github.click();
    await expect(github).not.toBeChecked();
  });
});

test.describe("sidebar and search", () => {
  test("the command palette opens with the keyboard and navigates", async ({ page }) => {
    await register(page);
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("docs-site");
    await chooseFolder(page, process.cwd());
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project created")).toBeVisible();

    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Search threads, projects and pages…")).toBeVisible();

    await page.keyboard.type("usage");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\/usage$/);

    await page.getByRole("button", { name: "Search" }).click();
    await page.keyboard.type("docs-site");
    await page.getByRole("option", { name: "docs-site", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  });
});
