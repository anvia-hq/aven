import { expect, test } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

test.describe("importing a repository", () => {
  test("without a connected GitHub account it offers to connect one", async ({ page }) => {
    await registerUser(page, "gh", "GitHub User");
    await page.goto("/projects");
    await page.getByRole("button", { name: "Import repository" }).click();

    const connect = page.getByRole("button", { name: "Connect GitHub" });
    await expect(connect).toBeVisible();
    await expect(connect).toHaveAttribute(
      "href",
      /github\.com\/apps\/aven-e2e\/installations\/new\?state=/,
    );
    await expect(page.getByRole("button", { name: "New project" })).toHaveCount(0);
  });

  test("a repository can be imported once", async ({ page }) => {
    await registerUser(page, "gh", "GitHub User");
    await addRunner(page);
    await connectGithub(page);
    await importRepository(page, "shiny-app");
    await expect(page.getByRole("link", { name: /shiny-app/ })).toContainText("acme/shiny-app");

    await page.getByRole("button", { name: "Import repository" }).click();
    await page.getByRole("combobox", { name: "Repository" }).click();
    await page.getByRole("option", { name: "acme/shiny-app" }).click();
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("This repository is already imported")).toBeVisible();
  });

  test("a callback with a state made for someone else is refused", async ({ page }) => {
    await registerUser(page, "gh", "GitHub User");
    const response = await page.request.get(
      "/api/github/callback?installation_id=1&code=fake&state=forged.state",
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(422);
    const installations = await page.request.get("/api/github/installations");
    expect(await installations.json()).toEqual([]);
  });
});
