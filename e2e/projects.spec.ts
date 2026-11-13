import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, registerUser, seedGithubProject } from "./helpers";

async function importProject(page: Page, repository: string) {
  return seedGithubProject(page, repository, "first");
}

async function startThread(page: Page, projectId: string, title: string) {
  const response = await page.request.post("/api/threads", { data: { projectId, title } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { id: string };
}

test.describe("projects browser", () => {
  test("shows each project with its threads, and a project opens its page", async ({ page }) => {
    await registerUser(page, "browser", "Browser Person");
    await addRunner(page);
    await connectGithub(page);
    const shiny = await importProject(page, "shiny-app");
    const docs = await importProject(page, "docs-site");
    await startThread(page, shiny.id, "Explain the project layout");
    await startThread(page, shiny.id, "Fix the login bug");
    await startThread(page, docs.id, "Write the readme");

    await page.goto("/projects");
    const projects = page.getByRole("region", { name: "Project list" });

    await expect(projects.getByRole("link", { name: /^shiny-app/ })).toBeVisible();
    await expect(projects.getByRole("link", { name: /^docs-site/ })).toBeVisible();
    await expect(projects.getByRole("link", { name: /Explain the project layout/ })).toBeVisible();
    await expect(projects.getByRole("link", { name: /Write the readme/ })).toBeVisible();

    await projects.getByRole("link", { name: /^shiny-app/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${shiny.id}$`));
    await page.goBack();
    await expect(projects.getByRole("link", { name: /Write the readme/ })).toBeVisible();
    await expect(projects.getByRole("link", { name: /Fix the login bug/ })).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Search projects" });
    await search.fill("docs");
    await expect(projects.getByRole("link", { name: /^docs-site/ })).toBeVisible();
    await expect(projects.getByRole("link", { name: /^shiny-app/ })).toHaveCount(0);

    await search.fill("");
    await search.pressSequentially("docs ");
    await expect(search).toHaveValue("docs ");
    await expect(projects.getByRole("link", { name: /^docs-site/ })).toBeVisible();

    await search.fill("nothing here");
    await expect(projects.getByText("No projects match these filters.")).toBeVisible();
    await projects.getByRole("button", { name: "Clear filters" }).click();
    await expect(projects.getByRole("link", { name: /^shiny-app/ })).toBeVisible();

    await projects.getByRole("tab", { name: "Working" }).click();
    await expect(projects.getByText("No projects match these filters.")).toBeVisible();
    await projects.getByRole("button", { name: "Clear filters" }).click();
    await expect(projects.getByRole("link", { name: /^shiny-app/ })).toBeVisible();
  });

  test("keeps archived threads apart and reopens the page on them", async ({ page }) => {
    await registerUser(page, "archive", "Archive Person");
    await addRunner(page);
    await connectGithub(page);
    const project = await importProject(page, "shiny-app");
    await startThread(page, project.id, "Still going");
    const putAway = await startThread(page, project.id, "Put away");
    await page.request.patch(`/api/threads/${putAway.id}`, { data: { state: "archived" } });

    await page.goto("/projects");
    const threads = page.getByRole("region", { name: "Project list" });
    await expect(threads.getByRole("link", { name: /Still going/ })).toBeVisible();
    await expect(threads.getByRole("link", { name: /Put away/ })).toHaveCount(0);

    await threads.getByRole("tab", { name: /Archived/ }).click();
    await expect(threads.getByRole("link", { name: /Put away/ })).toBeVisible();
    await expect(threads.getByRole("link", { name: /Still going/ })).toHaveCount(0);

    await page.reload();
    await expect(threads.getByRole("link", { name: /Still going/ })).toBeVisible();
    await expect(threads.getByRole("tab", { name: /Open/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
