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
    // The run needs a model grant; the pretend runner never calls the model.
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
    // What would be shipped, as lines added and removed, beside the button above the composer.
    await expect(page.getByTitle("Changes not shipped yet")).toHaveText("+2 -1");

    // The agent opens the pull request with gh, as the person (the pretend GitHub keeps it).
    await page.request.post("http://localhost:8101/repos/acme/shiny-app/pulls", {
      data: { head: `aven/${threadId.slice(0, 8)}`, title: "Add the export button" },
    });
    await page.getByRole("button", { name: "Ship", exact: true }).click();

    await expect(page.getByText("The agent is working on it in this thread")).toBeVisible();
    // The agent was sent the default ship prompt, with where the thread is.
    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    const prompt = String(events.find((event) => event.type === "started")?.prompt);
    // The repository's own way of shipping, which /setup-ship wrote.
    expect(prompt).toContain("gh pr create --draft");
    expect(prompt).toContain(`This thread's branch is aven/${threadId.slice(0, 8)}`);
    expect(prompt).toContain("default branch is main");

    // Once the run has ended, the control plane has found the pull request for the thread's branch.
    await expect(page.getByRole("link", { name: /#7/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/pull/7",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("button", { name: "Update PR" })).toBeVisible();

    // It survives a reload, since it is kept on the thread.
    await page.reload();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible();
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

    // The first ship opens a pull request on the thread's own branch.
    await page.goto(`/threads/${threadId}`);
    await page.request.post(pulls, { data: { head: branch, title: "Add the export button" } });
    await page.getByRole("button", { name: "Ship", exact: true }).click();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Update PR" })).toBeVisible();

    // Unrelated work can go in a pull request of its own, from a branch of the thread's prefix (the
    // pretend GitHub keeps the one the agent opens, before the run that would open it ends).
    await page.request.post(pulls, { data: { head: `${branch}-docs`, title: "Fix the docs" } });
    await page.getByRole("button", { name: "More ways to ship" }).click();
    await page.getByRole("menuitem", { name: "Ship as a new PR" }).click();
    await expect.poll(() => events.filter((event) => event.type === "started")).toHaveLength(2);
    const prompt = String(events.filter((event) => event.type === "started")[1]?.prompt);
    expect(prompt).toContain(`git switch -c ${branch}-<short-slug> origin/main`);
    expect(prompt).toContain("- #7 open");
    // Aven has not seen the second one yet.
    expect(prompt).not.toContain("#8");

    // Once that run has ended, the newest pull request is the one linked, and both are listed.
    await expect(page.getByRole("link", { name: /#8/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "More ways to ship" }).click();
    await expect(page.getByRole("menuitem", { name: /#7.*Add the export button/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /#8.*Fix the docs/ })).toBeVisible();
  });

  test("a person who has not connected GitHub is offered to, and comes back to the thread", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    // Asked for the app the thread's project is of (decision 0123).
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

  // Ship waits for the repository to be set up (decision 0083): /setup-env's script and
  // /setup-ship's way of shipping, in the thread's workspace.
  test.describe("a repository that is not set up to ship", () => {
    async function threadWith(page: Page, files: string) {
      await registerUser(page, "shp", "Ship User");
      const { child, threadId } = await threadOnFakeRunner(page, { FAKE_AVEN_FILES: files });
      runner = child;
      await page.goto(`/threads/${threadId}`);
      return threadId;
    }
    const shipButton = (page: Page) => page.getByRole("button", { name: "Ship", exact: true });
    // The button is disabled while the check is still on its way, and the tooltip comes with the
    // answer: hover again until it shows.
    const explanation = async (page: Page) => {
      const tooltip = page.locator('[data-slot="tooltip-content"]');
      await expect(async () => {
        await page.mouse.move(0, 0);
        await shipButton(page).locator("xpath=..").hover();
        await expect(tooltip).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 10_000 });
      return tooltip;
    };

    test("cannot be shipped, and says which commands to run", async ({ page }) => {
      await threadWith(page, "");

      await expect(shipButton(page)).toBeDisabled();
      await expect(await explanation(page)).toContainText("run /setup-env and /setup-ship");
    });

    test("with only the environment, it asks for /setup-ship", async ({ page }) => {
      await threadWith(page, "setup");

      await expect(shipButton(page)).toBeDisabled();
      const tooltip = await explanation(page);
      await expect(tooltip).toContainText("run /setup-ship in this thread");
      await expect(tooltip).not.toContainText("/setup-env");
    });

    test("with only the way of shipping, it asks for /setup-env", async ({ page }) => {
      await threadWith(page, "ship");

      await expect(shipButton(page)).toBeDisabled();
      const tooltip = await explanation(page);
      await expect(tooltip).toContainText("run /setup-env in this thread");
      await expect(tooltip).not.toContainText("/setup-ship");
    });

    test("with both it can be shipped", async ({ page }) => {
      await threadWith(page, "setup,ship");

      await expect(shipButton(page)).toBeEnabled();
    });
  });
});
