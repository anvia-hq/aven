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

    // A quick view is a set of filters, kept in the address.
    await page.getByRole("button", { name: "Needs my review" }).click();
    await expect(page).toHaveURL(/reviewRequested=me/);
    await expect(pulls.getByText("Open pull request 12").first()).toBeVisible();
    await expect(pulls.getByText("Open pull request 9")).toHaveCount(0);
    await page.getByRole("button", { name: "Failing checks" }).click();
    await expect(pulls.getByText("Open pull request 11").first()).toBeVisible();
    await expect(pulls.getByText("Open pull request 12")).toHaveCount(0);

    // A label on a row narrows to it, and can be taken off again.
    await page.getByRole("button", { name: "All open" }).click();
    await pulls.getByRole("button", { name: "bug" }).first().click();
    await expect(page).toHaveURL(/label=bug/);
    await expect(pulls.getByText("Open pull request 11")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove the label filter" }).click();
    await expect(pulls.getByText("Open pull request 11").first()).toBeVisible();

    // The state, and words of the title.
    await page.getByRole("combobox", { name: "State" }).click();
    await page.getByRole("option", { name: "Merged" }).click();
    await expect(pulls.getByText("Merged pull request").first()).toBeVisible();
    await expect(pulls.getByText("Open pull request 12")).toHaveCount(0);
    await page.goto("/center");
    await page.getByRole("searchbox", { name: "Search titles" }).fill("request 7");
    await expect(pulls.getByText("Open pull request 7").first()).toBeVisible();
    await expect(pulls.getByText("Open pull request 12")).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Search titles" }).fill("");
    await expect(pulls.getByText("Open pull request 12").first()).toBeVisible();

    // A pull request opens beside the lists, with its checks, its reviewers and its files; its link
    // is in the address.
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

    // So does a commit, with its whole message.
    await page.getByRole("link", { name: "Change number 14" }).first().click();
    await expect(page).toHaveURL(/commit=/);
    await expect(page.getByRole("dialog").getByText("Why it changed, in full.")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page).not.toHaveURL(/commit=/);

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
