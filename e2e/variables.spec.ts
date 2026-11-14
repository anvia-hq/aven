import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

async function openProject(page: Page) {
  await registerUser(page, "vars", "Variables User");
  await addRunner(page);
  await connectGithub(page);
  await importRepository(page, "shiny-app");
  await page
    .getByRole("region", { name: "Project list" })
    .getByRole("link", { name: /^shiny-app/ })
    .click();
  return page.getByRole("region", { name: "Environment variables" });
}

async function add(page: Page, name: string, value: string, secret = false) {
  await page
    .getByRole("region", { name: "Environment variables" })
    .getByRole("button", { name: "Add" })
    .click();
  await page.getByLabel("Name 1").fill(name);
  await page.getByLabel("Value 1").fill(value);

  if (secret) await page.getByRole("switch", { name: "Secret" }).click();

  await page.getByRole("button", { name: "Add variable" }).click();
  await expect(page.getByText("Variable saved")).toBeVisible();
}

async function pasteIntoName(page: Page, text: string) {
  await page.getByLabel("Name 1").focus();
  await page.evaluate((pasted) => {
    const data = new DataTransfer();
    data.setData("text", pasted);
    document.activeElement?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
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
    await page.getByLabel("Name 1").fill("GIT_DIR");
    await page.getByLabel("Value 1").fill("x");

    await expect(page.getByText("Reserved for Aven's own use")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add variable" })).toBeDisabled();
  });

  test("changing a secret asks for its value again; removing a variable removes it", async ({
    page,
  }) => {
    const section = await openProject(page);
    await add(page, "TOKEN", "a-long-secret-value-9876", true);

    await section.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Value")).toHaveAttribute("required", "");
    await page.getByRole("switch", { name: "Secret" }).click();
    await expect(page.getByLabel("Value")).toHaveAttribute("required", "");
    await page.keyboard.press("Escape");

    await section.getByRole("button", { name: "Remove TOKEN" }).click();
    await expect(page.getByText("Variable removed")).toBeVisible();
    await expect(section).toContainText("None yet");
  });

  test("pasting a .env into a name field makes a row for every variable in it", async ({
    page,
  }) => {
    const section = await openProject(page);
    await section.getByRole("button", { name: "Add" }).click();
    await pasteIntoName(
      page,
      '# app\nDATABASE_URL=postgres://localhost/app\nexport PORT=3000\n\nNAME="two words"\nGIT_DIR=x\n',
    );

    await expect(page.getByLabel("Name 1")).toHaveValue("DATABASE_URL");
    await expect(page.getByLabel("Value 1")).toHaveValue("postgres://localhost/app");
    await expect(page.getByLabel("Name 2")).toHaveValue("PORT");
    await expect(page.getByLabel("Value 3")).toHaveValue("two words");
    await expect(page.getByLabel("Name 4")).toHaveValue("GIT_DIR");
    await expect(page.getByText("Reserved for Aven's own use")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add 4 variables" })).toBeDisabled();
    await page.getByRole("button", { name: "Remove row 4" }).click();

    await page.getByLabel("Value 2").fill("4000");
    await page.getByRole("button", { name: "Add 3 variables" }).click();
    await expect(page.getByText("3 variables saved")).toBeVisible();
    await expect(section).toContainText("postgres://localhost/app");
    await expect(section).toContainText("4000");
    await expect(section).toContainText("two words");
  });

  test("the add dialog is always rows to fill in, and secret hides the values", async ({
    page,
  }) => {
    const section = await openProject(page);
    await section.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("Name 1").fill("TOKEN");
    await page.getByLabel("Value 1").fill("a-long-secret-value-9876");
    await page.getByRole("button", { name: "Add another" }).click();
    await page.getByLabel("Name 2").fill("OTHER");
    await page.getByLabel("Value 2").fill("other-secret-value-1111");
    await page.getByRole("switch", { name: "Secret" }).click();
    await expect(page.getByLabel("Value 1")).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Remove row 2" }).click();
    await page.getByRole("button", { name: "Add variable" }).click();
    await expect(page.getByText("Variable saved")).toBeVisible();
    await expect(section).toContainText("••••••9876");
    await expect(section).not.toContainText("OTHER");
    await expect(page.getByText("a-long-secret")).toHaveCount(0);
  });

  test("a secret with no value is left out, and the rest are still saved", async ({ page }) => {
    const section = await openProject(page);
    await section.getByRole("button", { name: "Add" }).click();
    await pasteIntoName(
      page,
      "FILLED=a-long-secret-value-5555\nEMPTY=\nALSO_FILLED=another-secret-9999\n",
    );
    await page.getByRole("switch", { name: "Secret" }).click();

    await expect(page.getByText("A secret needs a value, so this one is not added.")).toBeVisible();
    await page.getByRole("button", { name: "Add 2 variables" }).click();
    await expect(page.getByText("2 variables saved")).toBeVisible();
    await expect(section).toContainText("FILLED");
    await expect(section).toContainText("ALSO_FILLED");
    await expect(section).not.toContainText("EMPTY");
  });

  test("a row with a bad or doubled name cannot be saved until it is fixed", async ({ page }) => {
    const section = await openProject(page);
    await section.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("Name 1").fill("1BAD");
    await page.getByLabel("Value 1").fill("x");
    await page.getByRole("button", { name: "Add another" }).click();
    await page.getByLabel("Name 2").fill("GOOD");
    await page.getByLabel("Value 2").fill("y");
    await expect(page.getByText("Use letters, digits and underscores")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add 2 variables" })).toBeDisabled();

    await page.getByLabel("Name 1").fill("GOOD");
    await expect(page.getByText("Named twice").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Add 2 variables" })).toBeDisabled();

    await page.getByLabel("Name 1").fill("FIRST");
    await expect(page.getByRole("button", { name: "Add 2 variables" })).toBeEnabled();
  });

  test("a pasted .env with long values keeps the dialog and its button on the screen", async ({
    page,
  }) => {
    const section = await openProject(page);
    await section.getByRole("button", { name: "Add" }).click();
    const longValue = "x".repeat(900);
    await pasteIntoName(
      page,
      `FIRST_KEY="-----BEGIN-----\\n${longValue}\\n-----END-----"\nSECOND_KEY=${longValue}`,
    );

    const dialog = page.getByRole("dialog", { name: "Add a variable" });
    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.getByRole("button", { name: "Add 2 variables" })).toBeInViewport();
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

  test("a person's own and the workspace's variables are managed on their settings pages", async ({
    page,
  }) => {
    await registerUser(page, "pages", "Pages User");

    await page.goto("/settings/environment-variables");
    const own = page.getByRole("region", { name: "Your variables" });
    await expect(own).toContainText("None yet");
    await own.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("Name 1").fill("MY_TOKEN");
    await page.getByLabel("Value 1").fill("not-a-secret");
    await page.getByRole("button", { name: "Add variable" }).click();
    await expect(page.getByText("Variable saved")).toBeVisible();
    await expect(own).toContainText("MY_TOKEN");

    await page.goto("/settings/workspace-variables");
    const shared = page.getByRole("region", { name: "Workspace variables" });
    await expect(shared.getByRole("button", { name: "Add" })).toBeVisible();
    await shared.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("Name 1").fill("REGISTRY");
    await page.getByLabel("Value 1").fill("registry.example.com");
    await page.getByRole("button", { name: "Add variable" }).click();
    await expect(shared).toContainText("registry.example.com");
    await expect(shared).not.toContainText("MY_TOKEN");

    await shared.getByRole("button", { name: "Remove REGISTRY" }).click();
    await expect(shared).toContainText("None yet");
  });

  test("a project's page lists what it inherits, and what replaces what", async ({ page }) => {
    const section = await openProject(page);
    await expect(page.getByRole("region", { name: "Inherited variables" })).toHaveCount(0);

    for (const [scope, name, value] of [
      ["workspace", "REGION", "eu"],
      ["workspace", "TIER", "free"],
      ["personal", "REGION", "mine"],
    ] as const) {
      const saved = await page.request.put(`/api/variables/${scope}/${name}`, {
        data: { value, secret: false },
      });
      expect(saved.ok()).toBe(true);
    }
    await add(page, "TIER", "project");
    await page.reload();

    const inherited = page.getByRole("region", { name: "Inherited variables" });
    await expect(inherited).toContainText("REGION");
    await expect(inherited).toContainText("You");
    await expect(inherited.getByText("REGION")).toHaveCount(1);
    await expect(inherited).toContainText("TIER");
    await expect(inherited).toContainText("replaced by the project's");
    await expect(section).toContainText("TIER");
  });

  test("every scope keeps a history of who changed what, and never the values", async ({
    page,
  }) => {
    await openProject(page);
    const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    const paths = {
      project: `/api/projects/${projects[0]!.id}/variables`,
      workspace: "/api/variables/workspace",
      personal: "/api/variables/personal",
    };

    for (const path of Object.values(paths)) {
      await page.request.put(`${path}/AUDITED`, { data: { value: "first", secret: false } });
      await page.request.put(`${path}/AUDITED`, {
        data: { value: "a-secret-value-that-stays-hidden-4321", secret: true },
      });
      await page.request.delete(`${path}/AUDITED`);

      const response = await page.request.get(`${path}/history`);
      expect(response.status()).toBe(200);
      const history = (await response.json()) as {
        name: string;
        action: string;
        secret: boolean;
        source: string;
        actor: string | null;
      }[];
      expect(history.map((event) => event.action)).toEqual(["removed", "updated", "created"]);
      expect(history.every((event) => event.name === "AUDITED")).toBe(true);
      expect(history.every((event) => event.actor === "Variables User")).toBe(true);
      expect(history.every((event) => event.source === "settings")).toBe(true);
      expect(await response.text()).not.toContain("stays-hidden");
      expect(await response.text()).not.toContain("first");
    }

    const workspace = (await (await page.request.get(`${paths.workspace}/history`)).json()) as {
      name: string;
    }[];
    expect(workspace).toHaveLength(3);
  });

  test("the history routes need a session", async ({ request }) => {
    for (const path of [
      "/api/variables/workspace/history",
      "/api/variables/personal/history",
      "/api/projects/00000000-0000-4000-8000-000000000000/variables/history",
    ]) {
      expect((await request.get(path)).status()).toBe(401);
    }
  });

  test("the History button shows who changed what, and says the values are not kept", async ({
    page,
  }) => {
    const section = await openProject(page);
    await add(page, "HISTORY_ME", "a-plain-value");
    await add(page, "HISTORY_SECRET", "a-secret-that-must-not-show-1234", true);
    await section.getByRole("button", { name: "Remove HISTORY_ME" }).click();
    await expect(page.getByText("Variable removed")).toBeVisible();

    await section.getByRole("button", { name: "History", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "History" });
    await expect(dialog).toContainText("The values are never kept");
    const events = dialog.getByRole("list", { name: "Variable history" }).getByRole("listitem");
    await expect(events).toHaveCount(3);
    await expect(events.nth(0)).toContainText("Variables User removed HISTORY_ME");
    await expect(events.nth(1)).toContainText("Variables User created HISTORY_SECRET");
    await expect(events.nth(1)).toContainText("Secret");
    await expect(events.nth(2)).toContainText("Variables User created HISTORY_ME");
    await expect(dialog).not.toContainText("must-not-show");
    await expect(dialog).not.toContainText("a-plain-value");
  });

  test("a scope with no changes says so", async ({ page }) => {
    await registerUser(page, "emptyhist", "History User");
    await page.goto("/settings/environment-variables");
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "History" })).toContainText(
      "Nothing has been changed yet.",
    );
  });
});
