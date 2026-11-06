import { expect, test } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

// Center: every project's pull requests and commits on one screen, from GitHub (the fake).
test.describe("Center", () => {
  test("shows the pull requests and commits of all projects, and one project with its graph", async ({
    page,
  }) => {
    await registerUser(page, "ctr", "Center User");
    await addRunner(page);
    await connectGithub(page);
    await page.goto("/projects");
    await importRepository(page, "docs-site");
    await importRepository(page, "shiny-app");

    // It is in the rail, under the cockpit's.
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.getByRole("link", { name: "Center" }).click();
    await expect(page).toHaveURL(/\/center$/);

    const pulls = page.getByRole("region", { name: "Pull requests" });
    await expect(pulls.getByText("Open pull request 12").first()).toBeVisible();
    await expect(pulls).toContainText("docs-site");
    await expect(pulls).toContainText("shiny-app");
    const commits = page.getByRole("region", { name: "Commits" });
    await expect(commits.getByText("Change number 14").first()).toBeVisible();

    // The closed ones, by the toggle.
    await pulls.getByRole("button", { name: "Closed" }).click();
    await expect(pulls.getByText("Merged pull request").first()).toBeVisible();

    // One project by itself: only its pull requests, and its commits as a graph with pages.
    await page
      .getByRole("list", { name: "Projects" })
      .getByRole("link", { name: "shiny-app" })
      .click();
    await expect(page).toHaveURL(/\/center\?project=/);
    await expect(page.getByRole("heading", { name: "shiny-app" })).toBeVisible();
    await expect(pulls).not.toContainText("docs-site");
    await expect(page.getByRole("navigation", { name: "Commit pages" })).toBeVisible();

    // And back to all of them.
    await page.getByRole("link", { name: "All projects" }).click();
    await expect(page.getByRole("heading", { name: "Center" })).toBeVisible();
  });
});
