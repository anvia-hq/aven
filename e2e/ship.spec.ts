import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const GITHUB_URL = `http://localhost:${process.env.E2E_GITHUB_PORT ?? 8101}`;

const UNSHIPPED = /\/api\/threads\/[^/]+\/diff\?scope=unshipped/;
const NO_CHANGES = { available: true, patch: "", truncated: false };
const BINARY_PATCH = `diff --git a/assets/logo.png b/assets/logo.png
index 1111111..2222222 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

const shipButton = (page: Page) => page.getByRole("button", { name: "Ship", exact: true });
const setUpButton = (page: Page) => page.getByRole("button", { name: "Set up shipping" });
const connectButton = (page: Page) => page.getByRole("button", { name: "Connect GitHub to ship" });
const changesBadge = (page: Page) => page.getByTitle("Changes not shipped yet");

test.describe("shipping a thread", () => {
  let runner: ChildProcess | undefined;
  let testKey: string;
  const pullsUrl = () => `${GITHUB_URL}/repos/acme/shiny-app/pulls?test=${testKey}`;

  test.beforeEach(async ({ page }, testInfo) => {
    testKey = `ship-${testInfo.testId}`;
    const reset = await page.request.post(`${GITHUB_URL}/__reset?test=${testKey}`);
    expect(reset.ok()).toBe(true);
  });

  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function provider(page: Page) {
    const made = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(made.ok()).toBe(true);
  }

  test("sends the agent the ship prompt, and the pull request it opens shows up with a link", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await expect(page.getByRole("link", { name: /#7/ })).toHaveCount(0);
    await expect(changesBadge(page)).toHaveText("+2 -1");

    await page.request.post(pullsUrl(), {
      data: { head: `aven/${threadId.slice(0, 8)}`, title: "Add the export button" },
    });
    await shipButton(page).click();

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
    await provider(page);
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
      await shipButton(page).click();
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
    await provider(page);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;
    const branch = `aven/${threadId.slice(0, 8)}`;

    await page.goto(`/threads/${threadId}`);
    await page.request.post(pullsUrl(), { data: { head: branch, title: "Add the export button" } });
    await shipButton(page).click();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Update PR" })).toBeVisible();

    await page.request.post(pullsUrl(), {
      data: { head: `${branch}-docs`, title: "Fix the docs" },
    });
    await page.getByRole("button", { name: "More ways to ship" }).click();
    await page.getByRole("menuitem", { name: "Ship as a new PR" }).click();
    await expect.poll(() => events.filter((event) => event.type === "started")).toHaveLength(2);
    const prompt = String(events.filter((event) => event.type === "started")[1]?.prompt);
    expect(prompt).toContain(`git switch -c ${branch}-<short-slug> origin/main`);
    expect(prompt).toContain("- #7 open");
    expect(prompt).not.toContain("#8");

    await expect(page.getByRole("link", { name: /#8/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "+1" }).click();
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

    await expect(connectButton(page)).toHaveAttribute(
      "href",
      `/api/github/connect?next=${encodeURIComponent(`/threads/${threadId}`)}&app=platform`,
    );
    await expect(shipButton(page)).toHaveCount(0);
  });

  test("keeps the action's place while the changes are still loading", async ({ page }) => {
    await registerUser(page, "shp", "Ship User");
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_AVEN_FILES: "setup,ship" });
    runner = child;
    const held = Promise.withResolvers<void>();
    await page.route("**/api/threads/*/diff*", async (route) => {
      await held.promise;
      await route.fallback();
    });
    try {
      await page.goto(`/threads/${threadId}`);
      await expect(page.getByRole("textbox", { name: "Prompt" })).toBeEnabled();
      const reading = page.getByRole("status", { name: "Reading the changes" });
      await expect(reading).toBeAttached();
      await expect(reading).toHaveCSS("opacity", "0");
      await expect(shipButton(page)).toHaveCount(0);
      await expect(changesBadge(page)).toHaveCount(0);
      await expect(page.getByRole("status", { name: "Changes loading" })).toHaveCSS("opacity", "0");
    } finally {
      held.resolve();
    }
    await expect(shipButton(page)).toBeEnabled();
    await expect(page.getByRole("status", { name: "Reading the changes" })).toHaveCount(0);
  });

  test("a pull request chip is never left behind a blank gap while the readiness check is slow", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;
    const branch = `aven/${threadId.slice(0, 8)}`;
    await page.goto(`/threads/${threadId}`);
    await page.request.post(pullsUrl(), { data: { head: branch, title: "Add the export button" } });
    await shipButton(page).click();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Update PR" })).toBeVisible();

    const held = Promise.withResolvers<void>();
    await page.route("**/api/threads/*/ship", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await held.promise;
      return route.fallback();
    });
    try {
      await page.reload();
      const chip = page.getByRole("link", { name: /#7/ });
      await expect(chip).toBeVisible();
      const reading = page.getByRole("status", { name: "Reading the changes" });
      await expect(reading).toBeAttached();
      await expect
        .poll(() => reading.evaluate((node) => Number(getComputedStyle(node).opacity)), {
          timeout: 3_000,
        })
        .toBeGreaterThan(0.4);
      const slot = await reading.boundingBox();
      const chipBox = await chip.boundingBox();
      expect(slot && slot.width > 0).toBe(true);
      expect(chipBox && slot && chipBox.x >= slot.x + slot.width).toBe(true);
      await page.screenshot({
        path: ".aven/proof/ship-gap/after.png",
        clip: {
          x: Math.max(0, slot!.x - 24),
          y: Math.max(0, slot!.y - 24),
          width: 520,
          height: slot!.height + 48,
        },
      });
    } finally {
      held.resolve();
    }
    await expect(page.getByRole("button", { name: "Update PR" })).toBeEnabled();
    await expect(page.getByRole("status", { name: "Reading the changes" })).toHaveCount(0);
  });

  test("a running thread with nothing to ship yet does not hold an empty place for the whole run", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS_AFTER: "60000",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;
    await page.route(UNSHIPPED, (route) => route.fulfill({ json: NO_CHANGES }));
    await page.goto(`/threads/${threadId}`);
    const sent = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "work on it" },
    });
    expect(sent.ok()).toBe(true);
    await expect(page.getByRole("img", { name: "Working" })).toHaveCount(1);

    await expect(page.getByRole("status", { name: "Reading the changes" })).toHaveCount(0, {
      timeout: 5_000,
    });
  });

  test("a changes request that failed says so, and Try again reads them again", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_AVEN_FILES: "setup,ship" });
    runner = child;
    let failing = true;
    await page.route(UNSHIPPED, (route) =>
      failing
        ? route.fulfill({ status: 500, body: "The runner could not read the changes" })
        : route.fallback(),
    );

    await page.goto(`/threads/${threadId}`);

    await expect(page.getByText("Changes unknown")).toBeVisible();
    await expect(shipButton(page)).toHaveCount(0);
    const again = page.getByRole("button", { name: "Try again" });
    await expect(again).toBeVisible();
    await expect(again).toHaveAttribute("title", "The runner could not read the changes");

    failing = false;
    await again.click();

    await expect(shipButton(page)).toBeEnabled();
    await expect(page.getByText("Changes unknown")).toHaveCount(0);
    await expect(changesBadge(page)).toHaveText("+2 -1");
  });

  test("offers to open a pull request when nothing is unshipped but the branch has work", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;
    await page.route(UNSHIPPED, (route) => route.fulfill({ json: NO_CHANGES }));

    await page.goto(`/threads/${threadId}`);

    const open = page.getByRole("button", { name: "Open a PR" });
    await expect(open).toBeEnabled();
    await expect(shipButton(page)).toHaveCount(0);
    await expect(changesBadge(page)).toHaveCount(0);

    await open.click();
    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
  });

  test("does not offer to open a pull request for a branch GitHub already has one for, and shows it", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const branch = `feat/vector-${testKey.slice(-8)}`;
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
      FAKE_BRANCH: branch,
    });
    runner = child;
    await page.request.post(pullsUrl(), { data: { head: branch, title: "Record vector context" } });
    await page.route(UNSHIPPED, (route) => route.fulfill({ json: NO_CHANGES }));

    await page.goto(`/threads/${threadId}`);

    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Open a PR" })).toHaveCount(0);
    await expect(shipButton(page)).toHaveCount(0);
  });

  test("two pull requests sit behind the newest one's +1, with no Ship", async ({ page }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;
    const branch = `aven/${threadId.slice(0, 8)}`;

    await page.goto(`/threads/${threadId}`);
    await page.request.post(pullsUrl(), { data: { head: branch, title: "Add the export button" } });
    await shipButton(page).click();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible({ timeout: 15_000 });
    await page.request.post(pullsUrl(), {
      data: { head: `${branch}-docs`, title: "Fix the docs" },
    });
    await page.getByRole("button", { name: "More ways to ship" }).click();
    await page.getByRole("menuitem", { name: "Ship as a new PR" }).click();
    await expect(page.getByRole("link", { name: /#8/ })).toBeVisible({ timeout: 15_000 });

    await page.route(UNSHIPPED, (route) => route.fulfill({ json: NO_CHANGES }));
    await page.reload();

    await expect(page.getByRole("link", { name: /#8/ })).toBeVisible();
    await expect(shipButton(page)).toHaveCount(0);
    await page.getByRole("button", { name: "+1" }).click();
    await expect(page.getByRole("menuitem", { name: /#7.*Add the export button/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /#8.*Fix the docs/ })).toBeVisible();
  });

  test("a change with no lines of its own reads as its files, not +0 -0", async ({ page }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_AVEN_FILES: "setup,ship" });
    runner = child;
    await page.route(UNSHIPPED, (route) =>
      route.fulfill({ json: { available: true, patch: BINARY_PATCH, truncated: false } }),
    );

    await page.goto(`/threads/${threadId}`);

    await expect(changesBadge(page)).toHaveText("1 file");
    await expect(changesBadge(page)).not.toContainText("+0");
    await expect(shipButton(page)).toBeEnabled();
  });

  test("keeps the pull request beside Connect GitHub when the account is not connected", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    await provider(page);
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship",
    });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.request.post(pullsUrl(), {
      data: { head: `aven/${threadId.slice(0, 8)}`, title: "Add the export button" },
    });
    await shipButton(page).click();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible({ timeout: 15_000 });

    await page.route("**/api/github/user?*", (route) =>
      route.fulfill({ json: { connected: false, login: null, appKey: "platform" } }),
    );
    await page.reload();

    await expect(connectButton(page)).toBeVisible();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible();
    await expect(shipButton(page)).toHaveCount(0);
  });

  test.describe("a repository that is not set up to ship", () => {
    async function threadWith(page: Page, files: string) {
      await registerUser(page, "shp", "Ship User");
      await provider(page);
      const { child, events, threadId } = await threadOnFakeRunner(page, {
        FAKE_AVEN_FILES: files,
      });
      runner = child;
      await page.goto(`/threads/${threadId}`);
      return { threadId, events };
    }

    test("with no way of shipping it offers to set it up, and sends /setup-ship", async ({
      page,
    }) => {
      const { events } = await threadWith(page, "");

      await expect(setUpButton(page)).toBeEnabled();
      await expect(shipButton(page)).toHaveCount(0);
      await expect(connectButton(page)).toHaveCount(0);

      await setUpButton(page).click();
      await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
      const started = events.find((event) => event.type === "started");
      expect(started?.prompt).toBe("/setup-ship");
      expect(started?.mentions).toEqual([{ type: "skill", name: "setup-ship", from: 0, to: 11 }]);
    });

    test("with both it can be shipped", async ({ page }) => {
      await threadWith(page, "ship");

      await expect(shipButton(page)).toBeEnabled();
      await expect(setUpButton(page)).toHaveCount(0);
    });
  });
});
