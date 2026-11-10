import { expect, test } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

test.describe("projects", () => {
  test("imports a repository as a project, lists it and opens it", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await addRunner(page);
    await connectGithub(page);
    await importRepository(page, "shiny-app");

    const list = page.getByRole("region", { name: "Project list" });
    await expect(list.getByRole("link")).toHaveCount(1);

    await list.getByRole("link", { name: "shiny-app" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expect(page.locator("header")).toContainText("shiny-app");
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "No threads in this project yet.",
    );

    await page.reload();
    await expect(page.locator("header")).toContainText("shiny-app");
    await expect(page.getByRole("heading", { name: "Project not found" })).toHaveCount(0);
  });

  test("a project's page lists the threads started in it", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await addRunner(page);
    await connectGithub(page);
    await importRepository(page, "shiny-app");

    const [project] = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    await page.goto(`/threads?project=${project!.id}`);
    await page.getByRole("textbox", { name: "Prompt" }).fill("Explain the project layout");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    await page.goto("/projects");
    await page.getByRole("region", { name: "Project list" }).getByRole("link").click();
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "Explain the project layout",
    );
  });
});

test.describe("settings", () => {
  test("user menu opens personal and workspace settings", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    const userCard = page.locator('[data-slot="sidebar-header"]');

    await userCard.getByRole("button", { name: /Workspace User/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toContainText("Workspace User");
    await expect(menu).toContainText("@");
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    expect(
      await menu
        .getByRole("menuitem")
        .evaluateAll((items) => items.map((item) => item.textContent)),
    ).toEqual([
      expect.stringContaining("member"),
      expect.stringContaining("Personal settings"),
      expect.stringContaining("Command palette"),
      expect.stringContaining("Sign out"),
    ]);
    const shapes = await menu.locator("[data-slot='avatar']").evaluateAll((avatars) =>
      avatars.map((avatar) => {
        const box = avatar.getBoundingClientRect();
        return [Math.round(box.width), Math.round(box.height)];
      }),
    );
    expect(shapes).toHaveLength(2);
    for (const [width, height] of shapes) {
      expect(width).toBe(height);
      expect(width).toBeLessThanOrEqual(40);
    }
    expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({
      path: ".aven/proof/user-menu/after.png",
      clip: { x: 0, y: 0, width: 420, height: 420 },
    });
    await page.getByRole("menuitem", { name: /Personal settings/ }).click();
    await expect(page).toHaveURL(/\/settings\/general$/);
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();

    await expect(page.getByRole("link", { name: "Aven", exact: true })).toBeVisible();
    await userCard.getByRole("button", { name: /Workspace User/ }).click();
    await page.getByRole("menu").getByRole("menuitem", { name: "Organization settings" }).click();
    await expect(page).toHaveURL(/\/settings\/members$/);

    await page.getByRole("link", { name: "Aven", exact: true }).click();
    await expect(page).toHaveURL(/\/threads$/);
  });

  test("the profile name saves and the dark mode switch changes the theme", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await page.goto("/settings/general");
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();

    await page.getByLabel("Name").fill("Renamed Person");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();
    await expect(page.getByText("Renamed Person")).toBeVisible();

    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("switch", { name: "Dark mode" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("settings navigation reaches every page", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/general$/);

    const nav = page.getByRole("navigation", { name: "Settings" });
    for (const [name, url] of [
      ["General", /general$/],
      ["Providers", /providers$/],
      ["Members", /members$/],
      ["Runtimes", /runtimes$/],
      ["Profile", /profile$/],
    ] as const) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
    }
  });

  test("a provider with one credential is set up, edited and removed", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await page.route("**/api/providers/models", (route) =>
      route.fulfill({ json: { models: ["deploy-one", "deploy-two"] } }),
    );
    await page.route("**/api/providers/*/models", (route) =>
      route.fulfill({ json: { models: ["deploy-one", "deploy-two"], efforts: {} } }),
    );
    await page.goto("/settings/providers");
    const azure = page.getByRole("listitem", { name: "Azure OpenAI" });

    await azure.getByRole("button", { name: "Set up" }).click();
    await page.getByLabel("Resource URL").fill("https://my-resource.openai.azure.com/openai");
    await page.getByLabel("API key").fill("azure-secret-1234");
    await expect(page.getByRole("combobox", { name: "Deployment" })).toContainText("deploy-one");
    await page.getByRole("button", { name: "Add provider" }).click();

    await expect(azure).toContainText("https://my-resource.openai.azure.com · deploy-one · …1234");
    await expect(azure.getByRole("button", { name: "Set up" })).toHaveCount(0);

    await azure.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("combobox", { name: "Deployment" }).click();
    await page.getByRole("option", { name: "deploy-two" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(azure).toContainText("deploy-two · …1234");

    await azure.getByRole("button", { name: "Remove Azure OpenAI" }).click();
    await expect(azure.getByRole("button", { name: "Set up" })).toBeVisible();
    await expect(
      page
        .getByRole("listitem", { name: "OpenAI-compatible" })
        .getByRole("button", { name: "Add" }),
    ).toBeVisible();
  });

  test("the kinds with an address make it from what the form asks, and each compatible service has its own panel", async ({
    page,
  }) => {
    await registerUser(page, "ws", "Workspace User");
    await page.route("**/api/providers/models", async (route) => {
      const sent = route.request().postDataJSON() as { kind: string; baseUrl?: string };
      const byKind: Record<string, string[]> = {
        bedrock: ["openai.gpt-oss-120b"],
        vertex: ["google/gemini-2.5-flash"],
        gemini: ["gemini-2.5-flash"],
      };
      let models = byKind[sent.kind] ?? ["model-a"];
      if (sent.baseUrl?.includes("groq")) models = ["llama-3.3-70b-versatile"];
      if (sent.baseUrl?.includes("11434")) models = ["llama3.1"];
      return route.fulfill({ json: { models } });
    });
    await page.goto("/settings/providers");
    const connected = page.getByRole("list").first();

    await page
      .getByRole("listitem", { name: "Amazon Bedrock" })
      .getByRole("button", { name: "Add" })
      .click();
    await page.getByLabel("Region").fill("us-west-2");
    await page.getByLabel("API key").fill("bedrock-secret-4321");
    await expect(page.getByRole("combobox", { name: "Model" })).toContainText(
      "openai.gpt-oss-120b",
    );
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(
      page.getByRole("listitem", { name: "Amazon Bedrock", exact: true }).first(),
    ).toContainText("https://bedrock-mantle.us-west-2.api.aws/v1 · openai.gpt-oss-120b · …4321");

    await page
      .getByRole("listitem", { name: "Google Vertex AI" })
      .getByRole("button", { name: "Add" })
      .click();
    await page.getByLabel("Project ID").fill("my-project-123");
    await page.getByLabel("Location").fill("global");
    await page.getByLabel("Credential").fill("ya29.pasted-token-9876");
    await expect(page.getByRole("combobox", { name: "Model" })).toContainText(
      "google/gemini-2.5-flash",
    );
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(
      page.getByText(
        "https://aiplatform.googleapis.com/v1/projects/my-project-123/locations/global/endpoints/openapi · google/gemini-2.5-flash · …9876",
      ),
    ).toBeVisible();

    const gemini = page.getByRole("listitem", { name: "Google Gemini" });
    await gemini.getByRole("button", { name: "Set up" }).click();
    await page.getByLabel("API key").fill("AIza-secret-5555");
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(gemini).toContainText("…5555");
    await expect(gemini.getByRole("button", { name: "Set up" })).toHaveCount(0);
    await expect(connected).toBeVisible();

    const addRows = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: /^(Add|Set up)$/ }) });
    await expect(addRows.last()).toHaveAccessibleName("OpenAI-compatible");
    const groq = page.getByRole("listitem", { name: "Groq" });
    await expect(groq).toContainText("Fast open models");
    await groq.getByRole("button", { name: "Set up" }).click();
    await expect(page.getByLabel("Base URL")).toHaveCount(0);
    await expect(page.getByLabel("API key")).toHaveAttribute("required", "");
    await page.getByLabel("API key").fill("gsk-secret-7777");
    await expect(page.getByRole("combobox", { name: "Model" })).toContainText(
      "llama-3.3-70b-versatile",
    );
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(page.getByRole("listitem", { name: "Groq" })).toContainText(
      "https://api.groq.com/openai/v1 · llama-3.3-70b-versatile · …7777",
    );
    await expect(
      page.getByRole("listitem", { name: "Groq" }).getByRole("button", { name: "Set up" }),
    ).toHaveCount(0);

    await page
      .getByRole("listitem", { name: "Ollama" })
      .getByRole("button", { name: "Set up" })
      .click();
    await expect(page.getByLabel("API key (optional)")).not.toHaveAttribute("required", "");
    await expect(page.getByRole("combobox", { name: "Model" })).toContainText("llama3.1");
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(page.getByRole("listitem", { name: "Ollama" })).toContainText(
      "http://localhost:11434/v1 · llama3.1",
    );
    await expect(
      page
        .getByRole("listitem", { name: "OpenAI-compatible" })
        .getByRole("button", { name: "Add" }),
    ).toBeVisible();
  });

  test("invite and remove a member", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await page.goto("/settings/members");
    const table = page.getByRole("list", { name: "Members" });
    await expect(table.getByRole("listitem")).toHaveCount(1);

    await page.getByRole("button", { name: "Invite member" }).click();
    await page.getByLabel("Email").fill("new.person@aven.test");
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(page.getByText("Invitation created")).toBeVisible();
    await expect(
      table.getByRole("listitem").filter({ hasText: "new.person@aven.test" }),
    ).toContainText("Pending");

    await page.getByRole("button", { name: "Remove new.person" }).click();
    await expect(table.getByText("new.person@aven.test")).toHaveCount(0);
  });
});

test.describe("sidebar and search", () => {
  test("the command palette opens with the keyboard and navigates", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await addRunner(page);
    await connectGithub(page);
    await page.goto("/threads");
    await importRepository(page, "docs-site");

    await expect(page.getByRole("heading", { name: "What should we build?" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByPlaceholder("Search threads, projects and pages…")).toBeVisible();

    await page.keyboard.type("members");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings\/members$/);

    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("docs-site");
    await page.getByRole("option", { name: "docs-site", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  });
});
