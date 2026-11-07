import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

async function inPopover(page: Page, filters: string) {
  await page.getByRole("button", { name: filters }).click();
  return page.getByRole("dialog");
}

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

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.getByRole("link", { name: "Center" }).click();
    await expect(page).toHaveURL(/\/center$/);

    const pulls = page.getByRole("region", { name: "Pull requests" });
    await expect(pulls.getByText("Open pull request 12").first()).toBeVisible();
    await expect(pulls).toContainText("docs-site");
    await expect(pulls).toContainText("shiny-app");
    const commits = page.getByRole("region", { name: "Commits" });
    await expect(commits.getByText("Change number 14").first()).toBeVisible();
    await expect(commits.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(commits.getByTitle("Tag v1.0").first()).toBeVisible();

    await page.getByRole("tab", { name: "Needs my review" }).click();
    await expect(page).toHaveURL(/reviewRequested=me/);
    await expect(pulls.getByText("Open pull request 12").first()).toBeVisible();
    await expect(pulls.getByText("Open pull request 9")).toHaveCount(0);
    await expect(pulls.getByRole("group", { name: "Active pull request filters" })).toContainText(
      "Needs my review",
    );
    await page.getByRole("tab", { name: "Failing checks" }).click();
    await expect(pulls.getByText("Open pull request 11").first()).toBeVisible();
    await expect(pulls.getByText("Open pull request 12")).toHaveCount(0);

    await page.getByRole("tab", { name: "All open" }).click();
    await pulls.getByRole("button", { name: "bug" }).first().click();
    await expect(page).toHaveURL(/label=bug/);
    await expect(pulls.getByText("Open pull request 11")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove the filter Label: bug" }).click();
    await expect(pulls.getByText("Open pull request 11").first()).toBeVisible();

    const filters = await inPopover(page, "Pull request filters");
    await filters.getByRole("combobox", { name: "State" }).click();
    await page.getByRole("option", { name: "Merged" }).click();
    await expect(pulls.getByText("Merged pull request").first()).toBeVisible();
    await expect(pulls.getByText("Open pull request 12")).toHaveCount(0);
    await page.goto("/center");
    await page.getByRole("searchbox", { name: "Search titles" }).fill("request 7");
    await expect(pulls.getByText("Open pull request 7").first()).toBeVisible();
    await expect(pulls.getByText("Open pull request 12")).toHaveCount(0);
    await page.getByRole("button", { name: /^Remove the filter “request 7”/ }).click();
    await expect(pulls.getByText("Open pull request 12").first()).toBeVisible();

    const commitFilters = await inPopover(page, "Commit filters");
    await commitFilters.getByRole("searchbox", { name: "Commit author" }).fill("bob");
    await page.keyboard.press("Escape");
    await expect(commits.getByText("No commits yet.")).toBeVisible();
    await page.getByRole("button", { name: "Remove the filter By bob" }).click();
    await page.getByRole("searchbox", { name: "Search commit messages" }).fill("number 13");
    await expect(commits.getByText("Change number 13").first()).toBeVisible();
    await expect(commits.getByText("Change number 14")).toHaveCount(0);
    await page.getByRole("button", { name: /^Remove the filter “number 13”/ }).click();
    await expect(commits.getByText("Change number 14").first()).toBeVisible();

    await page.getByRole("link", { name: "Open pull request 12" }).first().click();
    await expect(page).toHaveURL(/pr=/);
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: /Open pull request 12/ })).toBeVisible();
    await expect(drawer.getByRole("region", { name: "Checks" })).toContainText("tests");
    await expect(drawer.getByRole("region", { name: "Reviewers" })).toContainText(
      "ada · Review requested",
    );
    await expect(drawer.getByRole("region", { name: "Description" })).toContainText(
      "It makes the login faster.",
    );
    await expect(drawer.getByRole("region", { name: "Files changed" })).toContainText(
      "src/login.ts",
    );
    await expect(drawer.getByText("const c = 4;")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/pr=/);

    await page.getByRole("link", { name: "Change number 14" }).first().click();
    await expect(page).toHaveURL(/commit=/);
    await expect(page.getByRole("dialog").getByText("Why it changed, in full.")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).not.toHaveURL(/commit=/);

    await page
      .getByRole("list", { name: "Projects" })
      .getByRole("link", { name: "shiny-app" })
      .click();
    await expect(page).toHaveURL(/\/center\?project=/);
    await expect(page.getByRole("heading", { name: "shiny-app" })).toBeVisible();
    await expect(pulls).not.toContainText("docs-site");
    await expect(page.getByRole("navigation", { name: "Commit pages" })).toBeVisible();

    await page.getByRole("tab", { name: /Branches/ }).click();
    const branches = page.getByRole("region", { name: "Branches" });
    await expect(branches.getByRole("button", { name: "feature/login" })).toBeVisible();
    await expect(branches.getByTitle("3 ahead of and 2 behind the default branch")).toBeVisible();
    await expect(branches.getByTitle("1 ahead of and 40 behind the default branch")).toBeVisible();
    await expect(branches.getByText("Stale")).toHaveCount(1);
    await expect(branches.getByLabel("Protected")).toHaveCount(1);

    const history = page.getByRole("region", { name: "Commits" });
    await expect(history.getByText("Change number 14").first()).toBeVisible();
    await branches.getByRole("button", { name: "feature/login" }).click();
    await expect(page).toHaveURL(/branch=feature%2Flogin/);
    await expect(history.getByText("Change number 10").first()).toBeVisible();
    await expect(history.getByText("Change number 14")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove the filter Branch: feature/login" }).click();
    await expect(history.getByText("Change number 14").first()).toBeVisible();

    const one = await inPopover(page, "Commit filters");
    await one.getByRole("searchbox", { name: "Commits touching a file" }).fill("src/login.ts");
    await expect(history.getByText("Change number 14").first()).toBeVisible();
    await expect(history.getByText("Change number 13")).toHaveCount(0);
    await one.getByRole("searchbox", { name: "Commit author" }).fill("bob");
    await expect(history.getByText("No commits yet.")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Clear all" }).last().click();
    await page.getByRole("searchbox", { name: "Search commit messages" }).fill("number 12");
    await expect(history.getByText("Change number 12").first()).toBeVisible();
    await expect(history.getByText("Change number 14")).toHaveCount(0);
    await page.getByRole("button", { name: /^Remove the filter “number 12”/ }).click();

    await page.getByRole("link", { name: "All projects" }).click();
    await expect(page.getByRole("heading", { name: "Center" })).toBeVisible();
  });
});
