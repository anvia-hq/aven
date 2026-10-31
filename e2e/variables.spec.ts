import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

async function openProject(page: Page) {
  await registerUser(page, "vars", "Variables User");
  await addRunner(page);
  await connectGithub(page);
  await importRepository(page, "shiny-app");
  await page.getByRole("region", { name: "Project list" }).getByRole("link").click();
  return page.getByRole("region", { name: "Environment variables" });
}

async function add(page: Page, name: string, value: string, secret = false) {
  await page
    .getByRole("region", { name: "Environment variables" })
    .getByRole("button", { name: "Add" })
    .click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Value").fill(value);
  if (secret) await page.getByRole("switch", { name: "Secret" }).click();
  await page.getByRole("button", { name: "Add variable" }).click();
  await expect(page.getByText("Variable saved")).toBeVisible();
}

test.describe("project environment variables", () => {
  test("adds a plain variable and a secret; the secret's value is never shown", async ({
    page,
  }) => {
    const section = await openProject(page);
    await expect(section).toContainText("None yet");

    await add(page, "DATABASE_URL", "postgres://localhost/app");
    await add(page, "API_KEY", "sk-never-shown-abcdef-1234", true);

    await expect(section).toContainText("DATABASE_URL");
    await expect(section).toContainText("postgres://localhost/app");
    await expect(section).toContainText("API_KEY");
    await expect(section).toContainText("Secret");
    await expect(section).toContainText("••••••1234");
    await expect(page.getByText("sk-never-shown")).toHaveCount(0);

    // A cold reload shows the same, and still not the secret.
    await page.reload();
    await expect(section).toContainText("postgres://localhost/app");
    await expect(page.getByText("sk-never-shown")).toHaveCount(0);
  });

  test("says what a secret is hidden from", async ({ page }) => {
    const section = await openProject(page);
    await section.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("hidden from the output")).toHaveCount(0);
    await page.getByRole("switch", { name: "Secret" }).click();
    await expect(
      page.getByText(/8 characters or more is also hidden from the output/),
    ).toBeVisible();
  });

  test("refuses a reserved name", async ({ page }) => {
    const section = await openProject(page);

    await section.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("Name").fill("GIT_DIR");
    await page.getByLabel("Value").fill("x");
    await page.getByRole("button", { name: "Add variable" }).click();

    await expect(page.getByText("is reserved for Aven's own use")).toBeVisible();
    await expect(page.getByText("Variable saved")).toHaveCount(0);
  });

  test("changing a secret asks for its value again; removing a variable removes it", async ({
    page,
  }) => {
    const section = await openProject(page);
    await add(page, "TOKEN", "a-long-secret-value-9876", true);

    await section.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Value")).toHaveAttribute("required", "");
    // Turning "Secret" off does not make the value optional: it would wipe the secret.
    await page.getByRole("switch", { name: "Secret" }).click();
    await expect(page.getByLabel("Value")).toHaveAttribute("required", "");
    await page.keyboard.press("Escape");

    await section.getByRole("button", { name: "Remove TOKEN" }).click();
    await expect(page.getByText("Variable removed")).toBeVisible();
    await expect(section).toContainText("None yet");
  });

  test("an unknown project has no variables to read", async ({ page }) => {
    await openProject(page);
    const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    const missing = await page.request.get(
      "/api/projects/00000000-0000-4000-8000-000000000000/variables",
    );
    expect(missing.status()).toBe(404);
    const mine = await page.request.get(`/api/projects/${projects[0]!.id}/variables`);
    expect(mine.status()).toBe(200);
  });

  test("workspace and personal variables are set, listed and removed through their own routes", async ({
    page,
  }) => {
    // The person who registers owns the organization, so they may change the workspace's values.
    await registerUser(page, "scopes", "Scopes User");

    for (const scope of ["workspace", "personal"]) {
      const path = `/api/variables/${scope}`;
      expect(((await (await page.request.get(path)).json()) as unknown[]).length).toBe(0);

      const saved = await page.request.put(`${path}/REGION`, {
        data: { value: `${scope}-region`, secret: false },
      });
      expect(saved.ok()).toBe(true);
      const secret = await page.request.put(`${path}/TOKEN`, {
        data: { value: `${scope}-secret-value-1234`, secret: true },
      });
      expect(secret.ok()).toBe(true);

      const listed = (await (await page.request.get(path)).json()) as {
        name: string;
        value: string | null;
      }[];
      expect(listed.map((variable) => variable.name)).toEqual(["REGION", "TOKEN"]);
      expect(listed[0]!.value).toBe(`${scope}-region`);
      // A secret is never given back.
      expect(listed[1]!.value).toBeNull();
      expect(JSON.stringify(listed)).not.toContain("secret-value");

      expect((await page.request.delete(`${path}/REGION`)).status()).toBe(204);
      expect((await page.request.delete(`${path}/REGION`)).status()).toBe(404);
      const reserved = await page.request.put(`${path}/GIT_DIR`, {
        data: { value: "x", secret: false },
      });
      expect(reserved.status()).toBe(422);
      const emptySecret = await page.request.put(`${path}/EMPTY`, {
        data: { value: "", secret: true },
      });
      expect(emptySecret.status()).toBe(422);
    }

    // The two scopes are separate lists.
    const workspace = (await (await page.request.get("/api/variables/workspace")).json()) as {
      name: string;
    }[];
    expect(workspace.map((variable) => variable.name)).toEqual(["TOKEN"]);
  });

  test("the variables routes need a session", async ({ request }) => {
    for (const path of ["/api/variables/workspace", "/api/variables/personal"]) {
      expect((await request.get(path)).status()).toBe(401);
    }
  });
});
