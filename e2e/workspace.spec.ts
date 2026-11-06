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

    // A cold reload re-fetches the project list; it must not flash "Project not found".
    await page.reload();
    await expect(page.locator("header")).toContainText("shiny-app");
    await expect(page.getByRole("heading", { name: "Project not found" })).toHaveCount(0);
  });

  test("a project's page lists the threads started in it", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await addRunner(page);
    await connectGithub(page);
    await importRepository(page, "shiny-app");

    // Started in the project, as its page's Start thread button asks for.
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
    await page.getByRole("menuitem", { name: /Personal settings/ }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    // Settings is in the app's shell: the rail and the user menu are still there, and the logo goes back.
    await expect(page.getByRole("link", { name: "Aven", exact: true })).toBeVisible();
    await userCard.getByRole("button", { name: /Workspace User/ }).click();
    // The organization section of the menu has its own Settings item.
    await page.getByRole("menu").getByRole("menuitem", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/members$/);

    await page.getByRole("link", { name: "Aven", exact: true }).click();
    await expect(page).toHaveURL(/\/threads$/);
  });

  test("the profile name saves and the dark mode switch changes the theme", async ({ page }) => {
    await registerUser(page, "ws", "Workspace User");
    await page.goto("/settings/profile");
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
    await expect(page).toHaveURL(/\/settings\/profile$/);

    const nav = page.getByRole("navigation", { name: "Settings" });
    for (const [name, url] of [
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
    await page.goto("/settings/providers");
    const azure = page.getByRole("listitem", { name: "Azure OpenAI" });

    await azure.getByRole("button", { name: "Set up" }).click();
    await page.getByLabel("Resource URL").fill("https://my-resource.openai.azure.com/openai");
    await page.getByLabel("API key").fill("azure-secret-1234");
    await page.getByLabel("Deployment name").fill("deploy-one");
    await page.getByRole("button", { name: "Add provider" }).click();

    // One credential: the row now shows it, with Edit instead of Set up, and the URL kept as an origin.
    await expect(azure).toContainText("https://my-resource.openai.azure.com · deploy-one · …1234");
    await expect(azure.getByRole("button", { name: "Set up" })).toHaveCount(0);

    await azure.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Deployment name").fill("deploy-two");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(azure).toContainText("deploy-two · …1234");

    await azure.getByRole("button", { name: "Remove Azure OpenAI" }).click();
    await expect(azure.getByRole("button", { name: "Set up" })).toBeVisible();
    // Compatible servers stay many: Add is always there.
    await expect(
      page
        .getByRole("listitem", { name: "OpenAI-compatible" })
        .getByRole("button", { name: "Add" }),
    ).toBeVisible();
  });

  test("the kinds with an address make it from what the form asks, and a preset fills a compatible server", async ({
    page,
  }) => {
    await registerUser(page, "ws", "Workspace User");
    await page.goto("/settings/providers");
    const connected = page.getByRole("list").first();

    // Bedrock: a region becomes AWS's regional endpoint.
    await page
      .getByRole("listitem", { name: "Amazon Bedrock" })
      .getByRole("button", { name: "Add" })
      .click();
    await page.getByLabel("Region").fill("us-west-2");
    await page.getByLabel("API key").fill("bedrock-secret-4321");
    await page.getByLabel("Model", { exact: true }).fill("openai.gpt-oss-120b");
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(
      page.getByRole("listitem", { name: "Amazon Bedrock", exact: true }).first(),
    ).toContainText("https://bedrock-mantle.us-west-2.api.aws/v1 · openai.gpt-oss-120b · …4321");

    // Vertex AI: a project and a location become the project's endpoint.
    await page
      .getByRole("listitem", { name: "Google Vertex AI" })
      .getByRole("button", { name: "Add" })
      .click();
    await page.getByLabel("Project ID").fill("my-project-123");
    await page.getByLabel("Location").fill("global");
    await page.getByLabel("Credential").fill("ya29.pasted-token-9876");
    await page.getByLabel("Model id").fill("google/gemini-2.5-flash");
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(
      page.getByText(
        "https://aiplatform.googleapis.com/v1/projects/my-project-123/locations/global/endpoints/openapi · google/gemini-2.5-flash · …9876",
      ),
    ).toBeVisible();

    // Gemini takes only a key, and is then connected.
    const gemini = page.getByRole("listitem", { name: "Google Gemini" });
    await gemini.getByRole("button", { name: "Set up" }).click();
    await page.getByLabel("API key").fill("AIza-secret-5555");
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(gemini).toContainText("…5555");
    await expect(gemini.getByRole("button", { name: "Set up" })).toHaveCount(0);
    await expect(connected).toBeVisible();

    // A preset fills the name and the address, and can be let go.
    await page
      .getByRole("listitem", { name: "OpenAI-compatible" })
      .getByRole("button", { name: "Add" })
      .click();
    await page.getByRole("button", { name: "Groq" }).click();
    await expect(page.getByLabel("Name")).toHaveValue("Groq");
    await expect(page.getByLabel("Base URL")).toHaveValue("https://api.groq.com/openai/v1");
    await expect(page.getByLabel("API key")).toHaveAttribute("required", "");
    await page.getByRole("button", { name: "Ollama" }).click();
    await expect(page.getByLabel("Base URL")).toHaveValue("http://localhost:11434/v1");
    await expect(page.getByLabel("API key (optional)")).not.toHaveAttribute("required", "");
    await page.getByLabel("Model", { exact: true }).fill("llama3.1");
    await page.getByRole("button", { name: "Add provider" }).click();
    await expect(page.getByRole("listitem", { name: "Ollama" })).toContainText(
      "http://localhost:11434/v1 · llama3.1",
    );
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

    // The shortcut works on every page, settings included.
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("docs-site");
    await page.getByRole("option", { name: "docs-site", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  });
});
