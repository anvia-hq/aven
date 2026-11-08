import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("shipping a thread", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("sends the agent the ship prompt, and the pull request it opens shows up with a link", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await expect(page.getByRole("link", { name: /#7/ })).toHaveCount(0);
    await expect(page.getByTitle("Changes not shipped yet")).toHaveText("+2 -1");

    await page.request.post("http://localhost:8101/repos/acme/shiny-app/pulls", {
      data: { head: `aven/${threadId.slice(0, 8)}`, title: "Add the export button" },
    });
    await page.getByRole("button", { name: "Ship", exact: true }).click();

    await expect(page.getByText("The agent is working on it in this thread")).toBeVisible();
    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    const prompt = String(events.find((event) => event.type === "started")?.prompt);
    expect(prompt).toContain("gh pr create --draft");
    expect(prompt).toContain(`This thread's branch is aven/${threadId.slice(0, 8)}`);
    expect(prompt).toContain("default branch is main");

    await expect(page.getByRole("link", { name: /#7/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/pull/7",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("button", { name: "Update PR" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible();
  });

  test("shows the ship card at once, before the server has answered", async ({ page }) => {
    await registerUser(page, "shp", "Ship User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    const held = Promise.withResolvers<void>();
    await page.route("**/api/threads/*/ship", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await held.promise;
      return route.fallback();
    });
    try {
      await page.getByRole("button", { name: "Ship", exact: true }).click();
      await expect(page.getByText("Ship this thread")).toBeVisible({ timeout: 500 });
    } finally {
      held.resolve();
    }
    await expect.poll(() => page.getByText("Ship this thread").count()).toBe(1);
    await expect(page.getByText("The agent is working on it in this thread")).toBeVisible();
  });

  test("a thread with an open pull request ships the rest as a separate one, and lists both", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;
    const branch = `aven/${threadId.slice(0, 8)}`;
    const pulls = "http://localhost:8101/repos/acme/shiny-app/pulls";

    await page.goto(`/threads/${threadId}`);
    await page.request.post(pulls, { data: { head: branch, title: "Add the export button" } });
    await page.getByRole("button", { name: "Ship", exact: true }).click();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Update PR" })).toBeVisible();

    await page.request.post(pulls, { data: { head: `${branch}-docs`, title: "Fix the docs" } });
    await page.getByRole("button", { name: "More ways to ship" }).click();
    await page.getByRole("menuitem", { name: "Ship as a new PR" }).click();
    await expect.poll(() => events.filter((event) => event.type === "started")).toHaveLength(2);
    const prompt = String(events.filter((event) => event.type === "started")[1]?.prompt);
    expect(prompt).toContain(`git switch -c ${branch}-<short-slug> origin/main`);
    expect(prompt).toContain("- #7 open");
    expect(prompt).not.toContain("#8");

    await expect(page.getByRole("link", { name: /#8/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "More ways to ship" }).click();
    await expect(page.getByRole("menuitem", { name: /#7.*Add the export button/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /#8.*Fix the docs/ })).toBeVisible();
  });

  test("a person who has not connected GitHub is offered to, and comes back to the thread", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_AVEN_FILES: "setup,ship" });
    runner = child;
    await page.route("**/api/github/user?*", (route) =>
      route.fulfill({ json: { connected: false, login: null, appKey: "platform" } }),
    );

    await page.goto(`/threads/${threadId}`);

    const connect = page.getByRole("button", { name: "Connect GitHub to ship" });
    await expect(connect).toHaveAttribute(
      "href",
      `/api/github/connect?next=${encodeURIComponent(`/threads/${threadId}`)}&app=platform`,
    );
    await expect(page.getByRole("button", { name: "Ship", exact: true })).toHaveCount(0);
  });

  test("is not shown while the thread's changes are still loading", async ({ page }) => {
    await registerUser(page, "shp", "Ship User");
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_AVEN_FILES: "setup,ship" });
    runner = child;
    const held = Promise.withResolvers<void>();
    await page.route("**/api/threads/*/diff*", async (route) => {
      await held.promise;
      await route.fallback();
    });
    const answered = page.waitForResponse(
      (response) => response.url().includes("/ship") && response.ok(),
    );
    try {
      await page.goto(`/threads/${threadId}`);
      await answered;
      await expect(page.getByRole("textbox", { name: "Prompt" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Ship", exact: true })).toHaveCount(0);
    } finally {
      held.resolve();
    }
    await expect(page.getByRole("button", { name: "Ship", exact: true })).toBeEnabled();
  });

  test.describe("a repository that is not set up to ship", () => {
    async function threadWith(page: Page, files: string) {
      await registerUser(page, "shp", "Ship User");
      const { child, threadId } = await threadOnFakeRunner(page, { FAKE_AVEN_FILES: files });
      runner = child;
      readiness = page.waitForResponse(
        (response) => response.url().includes("/ship") && response.ok(),
      );
      await page.goto(`/threads/${threadId}`);
      return threadId;
    }
    let readiness: Promise<unknown>;
    const shipButton = (page: Page) => page.getByRole("button", { name: "Ship", exact: true });
    const stillAbsent = async (page: Page) => {
      await expect(page.getByRole("textbox", { name: "Prompt" })).toBeEnabled();
      await readiness;
      await expect(shipButton(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Connect GitHub to ship" })).toHaveCount(0);
    };

    test("shows no Ship button", async ({ page }) => {
      await threadWith(page, "");
      await stillAbsent(page);
    });

    test("with only the environment, still none", async ({ page }) => {
      await threadWith(page, "setup");
      await stillAbsent(page);
    });

    test("with only the way of shipping, still none", async ({ page }) => {
      await threadWith(page, "ship");
      await stillAbsent(page);
    });

    test("with both it can be shipped", async ({ page }) => {
      await threadWith(page, "setup,ship");

      await expect(shipButton(page)).toBeEnabled();
    });
  });
});
