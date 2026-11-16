import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

const CLOUD_ID = "00000000-0000-4000-8000-000000000002";
const MAC_ID = "00000000-0000-4000-8000-0000000000aa";
const now = new Date().toISOString();

const runtime = (id: string, name: string, over: Record<string, unknown>) => ({
  id,
  name,
  ownerId: null,
  host: false,
  shared: false,
  githubMode: "person",
  github: null,
  provider: "manual",
  directories: [],
  tokenHint: "",
  online: false,
  build: null,
  outdated: false,
  updateTo: null,
  isControlPlane: false,
  isCloud: false,
  parentRuntimeId: null,
  canUpdate: false,
  stats: null,
  lastSeenAt: null,
  createdAt: now,
  ...over,
});

const repository = {
  id: "00000000-0000-4000-8000-0000000000bb",
  name: "widgets",
  repoFullName: "acme/widgets",
  defaultBranch: "main",
  directory: null,
  runtimeId: null,
  createdBy: "someone",
  createdAt: now,
  updatedAt: now,
};

test.describe("Aven Cloud", () => {
  test("is a computer to pick for a repository, and not a runtime to manage", async ({ page }) => {
    await registerUser(page, "cloud", "Cloud User");
    await page.route("**/api/runtimes", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            json: [
              runtime(CLOUD_ID, "Aven Cloud", { isCloud: true, provider: "boat" }),
              runtime(MAC_ID, "sleepy-mac", {}),
            ],
          })
        : route.continue(),
    );
    await page.route("**/api/projects", (route) =>
      route.request().method() === "GET" ? route.fulfill({ json: [repository] }) : route.continue(),
    );

    await page.goto("/settings/runtimes");
    await expect(page.getByRole("listitem", { name: "sleepy-mac" })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Aven Cloud" })).toHaveCount(0);

    await page.goto("/threads");
    await page.getByRole("button", { name: "Project" }).click();
    await page.getByRole("button", { name: "widgets" }).click();
    const computer = page.getByRole("combobox", { name: "Computer" });
    await expect(computer).toContainText("Aven Cloud");

    await computer.click();
    await expect(page.getByRole("option", { name: "Aven Cloud" })).toBeEnabled();
    await expect(page.getByRole("option", { name: "sleepy-mac (offline)" })).toBeDisabled();
    await page.keyboard.press("Escape");

    const posted = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/api/threads"),
    );
    await page.route("**/api/threads", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, body: "stop here" })
        : route.continue(),
    );
    await page.getByRole("textbox", { name: "Prompt" }).fill("hello");
    await page.getByRole("button", { name: "Send" }).click();

    expect((await posted).postDataJSON()).toMatchObject({
      projectId: repository.id,
      runtimeId: CLOUD_ID,
    });
  });
});
