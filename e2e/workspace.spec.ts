import { expect, test, type Page } from "@playwright/test";

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

// A project lives on a runner; one that never connects is enough to create projects and threads.
async function addRunner(page: Page) {
  const response = await page.request.post("/api/runtimes", { data: { name: "runner" } });
  expect(response.ok()).toBe(true);
}

test.describe("projects", () => {
  test("creates a project, lists it and opens it", async ({ page }) => {
    await register(page);
    await addRunner(page);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("shiny-app");
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

  test("starts a thread from the project page", async ({ page }) => {
    await register(page);
    await addRunner(page);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("shiny-app");
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

  test("the profile name saves and the dark mode switch changes the theme", async ({ page }) => {
    await register(page);
    await page.goto("/settings/profile");
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();

    await page.getByLabel("Name").fill("Renamed Person");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();
    await expect(page.getByText("Renamed Person")).toBeVisible();

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
      ["Providers", /providers$/],
      ["Members", /members$/],
      ["Runtimes", /runtimes$/],
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
});

test.describe("sidebar and search", () => {
  test("the command palette opens with the keyboard and navigates", async ({ page }) => {
    await register(page);
    await addRunner(page);
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("docs-site");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project created")).toBeVisible();

    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Search threads, projects and pages…")).toBeVisible();

    await page.keyboard.type("members");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\/members$/);

    await page.getByRole("button", { name: "Search" }).click();
    await page.keyboard.type("docs-site");
    await page.getByRole("option", { name: "docs-site", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  });
});
