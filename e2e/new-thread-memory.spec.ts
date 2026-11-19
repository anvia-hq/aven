import { expect, test } from "@playwright/test";

import { addRunner, connectGithub, registerUser, seedGithubProject } from "./helpers";

const PROJECT_KEY = "aven.new-thread.project";

test.describe("the new thread page", () => {
  test("opens on the project that was chosen last, and a project in the link wins", async ({
    page,
  }) => {
    await registerUser(page, "remember", "Remember Person");
    await addRunner(page);
    await connectGithub(page);
    const shiny = await seedGithubProject(page, "shiny-app", "first");
    const docs = await seedGithubProject(page, "docs-site", "first");
    const project = page.getByRole("button", { name: "Project" });

    await page.goto("/threads");
    await expect(project).toBeVisible();
    await page.evaluate(
      ([key, id]) => localStorage.setItem(key!, JSON.stringify(id)),
      [PROJECT_KEY, docs.id],
    );
    await page.reload();
    await expect(project).toContainText("docs-site");

    await page.goto(`/threads?project=${shiny.id}`);
    await expect(project).toContainText("shiny-app");

    await page.goto("/threads");
    await expect(project).toContainText("docs-site");
  });

  test("remembers a project picked on the page", async ({ page }) => {
    await registerUser(page, "picked", "Picked Person");
    await addRunner(page);
    await connectGithub(page);
    await seedGithubProject(page, "shiny-app", "first");
    const docs = await seedGithubProject(page, "docs-site", "first");

    await page.goto("/threads");
    await page.getByRole("button", { name: "Project" }).click();
    await page.getByText("shiny-app", { exact: true }).last().click();
    await expect(page.getByRole("button", { name: "Project" })).toContainText("shiny-app");
    await page.getByRole("button", { name: "Project" }).click();
    await page.getByText("docs-site", { exact: true }).last().click();

    await page.reload();
    await expect(page.getByRole("button", { name: "Project" })).toContainText("docs-site");
    expect(await page.evaluate((key) => localStorage.getItem(key), PROJECT_KEY)).toBe(
      JSON.stringify(docs.id),
    );
  });
});
