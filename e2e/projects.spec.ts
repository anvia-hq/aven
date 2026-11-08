import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, registerUser } from "./helpers";

async function importProject(page: Page, repository: string) {
  const [installation] = (await (await page.request.get("/api/github/installations")).json()) as {
    id: string;
  }[];
  const [runtime] = (await (await page.request.get("/api/runtimes")).json()) as { id: string }[];
  const response = await page.request.post("/api/projects", {
    data: {
      installationId: installation!.id,
      repository: `acme/${repository}`,
      runtimeId: runtime!.id,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { id: string; name: string };
}

async function startThread(page: Page, projectId: string, title: string) {
  const response = await page.request.post("/api/threads", { data: { projectId, title } });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { id: string };
}

test.describe("projects browser", () => {
  test("shows the projects on the left and the threads of the chosen one on the right", async ({
    page,
  }) => {
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
    const threads = page.getByRole("region", { name: "Thread list" });

    await expect(projects.getByRole("button", { name: "shiny-app" })).toBeVisible();
    await expect(projects.getByRole("button", { name: "docs-site" })).toBeVisible();
    await expect(threads.getByRole("link", { name: /Explain the project layout/ })).toBeVisible();
    await expect(threads.getByRole("link", { name: /Write the readme/ })).toBeVisible();

    await projects.getByRole("button", { name: "shiny-app" }).click();
    await expect(page).toHaveURL(new RegExp(`\\?project=${shiny.id}$`));
    await expect(projects.getByRole("button", { name: "shiny-app" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(threads.getByRole("link", { name: /Fix the login bug/ })).toBeVisible();
    await expect(threads.getByRole("link", { name: /Write the readme/ })).toHaveCount(0);
    await expect(threads).toContainText("acme/shiny-app");

    await page.getByRole("button", { name: "All projects" }).click();
    await expect(threads.getByRole("link", { name: /Write the readme/ })).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Search projects" });
    await search.fill("docs");
    await expect(projects.getByRole("button", { name: "docs-site" })).toBeVisible();
    await expect(projects.getByRole("button", { name: "shiny-app" })).toHaveCount(0);

    await search.fill("");
    await search.pressSequentially("docs ");
    await expect(search).toHaveValue("docs ");
    await expect(projects.getByRole("button", { name: "docs-site" })).toBeVisible();

    await search.fill("nothing here");
    await expect(projects.getByText("No projects match these filters.")).toBeVisible();
    await projects.getByRole("button", { name: "Clear filters" }).click();
    await expect(projects.getByRole("button", { name: "shiny-app" })).toBeVisible();

    await projects.getByRole("tab", { name: "Working" }).click();
    await expect(projects.getByText("No projects match these filters.")).toBeVisible();
    await projects.getByRole("button", { name: "Clear filters" }).click();
    await expect(projects.getByRole("button", { name: "shiny-app" })).toBeVisible();

    await page.goto("/projects");
    await projects.getByRole("link", { name: "Open docs-site" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${docs.id}$`));
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
    const threads = page.getByRole("region", { name: "Thread list" });
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
