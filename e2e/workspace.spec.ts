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

test.describe("projects", () => {
  test("lists projects, filters by status and opens a project", async ({ page }) => {
    await register(page);
    await page.getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);

    const list = page.getByRole("region", { name: "Project list" });
    await expect(list.getByRole("link")).toHaveCount(4);

    await page.getByRole("tab", { name: "Archived" }).click();
    await expect(list.getByRole("link")).toHaveCount(1);
    await expect(list.getByText("infra")).toBeVisible();

    await page.getByRole("tab", { name: "Active" }).click();
    await expect(list.getByRole("link")).toHaveCount(3);

    await list.getByRole("link", { name: /^aven/ }).click();
    await expect(page).toHaveURL(/\/projects\/p-aven$/);
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "Add rate limiting to the API",
    );
    await expect(page.getByRole("region", { name: "Commits" })).toContainText(
      "feat(threads): add mock agent UI",
    );
    await expect(page.getByRole("region", { name: "Files" })).toContainText("docker-compose.yml");
  });

  test("creates a project", async ({ page }) => {
    await register(page);
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("shiny-app");
    await page.getByLabel("Repository").fill("me/shiny-app");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByText("Project created")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Project list" }).getByText("shiny-app"),
    ).toBeVisible();
  });

  test("a project can be archived and restored", async ({ page }) => {
    await register(page);
    await page.goto("/projects/p-docs");
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText("Project archived")).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Start a thread" })).toHaveCount(0);

    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("region", { name: "Start a thread" })).toBeVisible();
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
    await expect(table.getByRole("row")).toHaveCount(5);

    await page.getByRole("button", { name: "Invite member" }).click();
    await page.getByLabel("Email").fill("new.person@aven.test");
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(page.getByText("Invitation sent")).toBeVisible();
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

test.describe("sidebar, activity and search", () => {
  test("thread groups show counts and can be expanded", async ({ page }) => {
    await register(page);
    const sidebar = page.locator('[data-slot="sidebar"]');

    await expect(sidebar.locator('[data-group="archived"]')).toContainText("1");
    await sidebar.getByRole("button", { name: /Archived/ }).click();
    await expect(sidebar.getByRole("link", { name: /Set up GitHub Actions/ })).toBeVisible();

    await sidebar.getByRole("button", { name: /Snoozed/ }).click();
    await expect(
      sidebar.getByRole("link", { name: /Rewrite the getting started guide/ }),
    ).toBeVisible();
  });

  test("archive and reopen a thread moves it between groups", async ({ page }) => {
    await register(page);
    const sidebar = page.locator('[data-slot="sidebar"]');
    await page.goto("/threads/t-flaky-e2e");

    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText("Thread archived")).toBeVisible();
    await expect(sidebar.locator('[data-group="archived"]')).toContainText("2");
    await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(sidebar.locator('[data-group="archived"]')).toContainText("1");
    await expect(page.getByRole("button", { name: "Snooze", exact: true })).toBeVisible();
  });

  test("activity feed filters by kind", async ({ page }) => {
    await register(page);
    await page.getByRole("link", { name: "Activity" }).click();
    await expect(page).toHaveURL(/\/activity$/);

    const feed = page.getByRole("list", { name: "Activity feed" });
    await expect(feed.getByRole("listitem")).toHaveCount(8);

    await page.getByRole("tab", { name: "Commits" }).click();
    await expect(feed.getByRole("listitem")).toHaveCount(3);

    await page.getByRole("tab", { name: "Team" }).click();
    await expect(feed.getByRole("listitem")).toHaveCount(2);
  });

  test("the command palette opens with the keyboard and navigates", async ({ page }) => {
    await register(page);
    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Search threads, projects and pages…")).toBeVisible();

    await page.keyboard.type("usage");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\/usage$/);

    await page.getByRole("button", { name: "Search" }).click();
    await page.keyboard.type("docs-site");
    await page.getByRole("option", { name: "docs-site", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/p-docs$/);
  });
});
