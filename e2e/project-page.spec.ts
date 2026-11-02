import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, registerUser } from "./helpers";

// The fake GitHub (e2e/fake-github.ts) has a repository with folders and a README, and one,
// composer-app, with no README.
async function projectOf(page: Page, name: string) {
  await addRunner(page);
  await connectGithub(page);
  const [installation] = await (await page.request.get("/api/github/installations")).json();
  const [runtime] = await (await page.request.get("/api/runtimes")).json();
  const response = await page.request.post("/api/projects", {
    data: { installationId: installation.id, repository: `acme/${name}`, runtimeId: runtime.id },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { id: string };
}

// A project's page is a repository's (decision 0082): its files and its README beside what is about
// the project.
test.describe("the project page", () => {
  test("lists the repository's folders and files, and shows its README", async ({ page }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "shiny-app");
    await page.goto(`/projects/${project.id}`);

    await expect(page.getByRole("heading", { name: "shiny-app", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "acme/shiny-app" })).toHaveAttribute(
      "href",
      "https://github.com/acme/shiny-app",
    );

    // Folders first, then files, each by name; a file is read on GitHub.
    const files = page.getByRole("region", { name: "Files" });
    await expect(files.getByRole("link")).toHaveText([
      "shiny-app",
      "docs",
      "src",
      "package.json",
      "README.md",
    ]);
    await expect(files.getByRole("link", { name: "package.json" })).toHaveAttribute(
      "href",
      "https://github.com/acme/shiny-app/blob/main/package.json",
    );

    // The README, whose relative link now points into the repository on GitHub.
    const readme = page.getByRole("region", { name: "README" });
    await expect(readme.getByRole("heading", { name: "shiny-app" })).toBeVisible();
    await expect(readme.getByRole("link", { name: "the guide" })).toHaveAttribute(
      "href",
      "https://github.com/acme/shiny-app/blob/main/docs/guide.md",
    );

    // What is about the project is beside it.
    await expect(page.getByRole("region", { name: "About" })).toContainText("main");
    await expect(page.getByRole("region", { name: "Recent threads" })).toBeVisible();
    await expect(page.getByText("Environment variables")).toBeVisible();
  });

  test("a folder opens in place, with a way back, and shows no README of its own", async ({
    page,
  }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "shiny-app");
    await page.goto(`/projects/${project.id}`);

    const files = page.getByRole("region", { name: "Files" });
    await files.getByRole("link", { name: "src" }).click();
    await expect(page).toHaveURL(/\/projects\/[\w-]+\?path=src$/);
    await expect(files.getByRole("link", { name: "index.ts" })).toBeVisible();
    await expect(files.getByRole("navigation", { name: "Folder" })).toContainText("src");
    await expect(page.getByRole("region", { name: "README" })).toHaveCount(0);

    // The folder is part of the address, so it is there after a reload.
    await page.reload();
    await expect(files.getByRole("link", { name: "index.ts" })).toBeVisible();

    await files.getByRole("link", { name: ".." }).click();
    await expect(page).toHaveURL(/\/projects\/[\w-]+$/);
    await expect(files.getByRole("link", { name: "docs" })).toBeVisible();
    await expect(page.getByRole("region", { name: "README" })).toBeVisible();
  });

  test("a repository with no README has no README section, and a path that is not a folder says so", async ({
    page,
  }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "composer-app");
    await page.goto(`/projects/${project.id}`);
    await expect(
      page.getByRole("region", { name: "Files" }).getByRole("link", { name: "src" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "README" })).toHaveCount(0);

    await page.goto(`/projects/${project.id}?path=nothing-here`);
    await expect(page.getByText("Could not read this repository on GitHub")).toBeVisible();
  });

  test("another organization's project is not found, and nothing of it is read", async ({
    page,
    browser,
  }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "shiny-app");

    const other = await browser.newPage();
    await registerUser(other, "stranger", "Stranger");
    expect((await other.request.get(`/api/projects/${project.id}/files`)).status()).toBe(404);
    expect((await other.request.get(`/api/projects/${project.id}/readme`)).status()).toBe(404);
    // A path that climbs out of the repository is refused before GitHub is asked.
    expect((await page.request.get(`/api/projects/${project.id}/files?path=..`)).status()).toBe(
      422,
    );
    await other.close();
  });
});
