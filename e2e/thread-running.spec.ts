import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

// A thread's project tile pulses in the sidebar while the thread runs. Only the thread that is open
// has a stream to hear its run end on, so the sidebar must find out for the others another way.
test.describe("a thread that is running", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function startRun(page: Page) {
    await registerUser(page, "pls", "Pulse Person");
    // The run needs a model grant; the pretend runner never calls the model.
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    // The run ends by itself a little after it starts: the spec is on another page by then.
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS_AFTER: "4000" });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    const sent = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "work on it" },
    });
    expect(sent.ok()).toBe(true);
    await expect(page.locator(".animate-pulse")).toHaveCount(1);
    return threadId;
  }

  // The server's own word on whether the thread is running.
  const runningOnServer = async (page: Page, threadId: string) => {
    const threads = (await (await page.request.get("/api/threads")).json()) as {
      id: string;
      running: boolean;
    }[];
    return threads.find((thread) => thread.id === threadId)?.running;
  };

  test("stops pulsing in the sidebar when its run ends while another page is open", async ({
    page,
  }) => {
    const threadId = await startRun(page);

    // Leave the thread by the app's own links, which keeps what the page knows; a reload would
    // fetch the list again and hide what is being tested.
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);

    // The run ends by itself, with nobody listening to it.
    await expect.poll(() => runningOnServer(page, threadId), { timeout: 15_000 }).toBe(false);

    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 15_000 });
  });

  test("a thread that began running while the sidebar thought it idle pulses once it is opened", async ({
    page,
  }) => {
    await registerUser(page, "pls", "Pulse Person");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS_AFTER: "30000" });
    runner = child;

    // The list is loaded with the thread idle, so nothing is checking on it.
    await page.goto("/projects");
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    const sent = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "work on it" },
    });
    expect(sent.ok()).toBe(true);

    // Opening it attaches to the run in progress, and the sidebar learns it from the snapshot.
    await page
      .getByRole("link", { name: /shiny-app/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}`));
    await expect(page.locator(".animate-pulse")).toHaveCount(1, { timeout: 3000 });
  });

  test("a thread opened after its run ended does not keep the sidebar pulsing", async ({
    page,
  }) => {
    const threadId = await startRun(page);
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect.poll(() => runningOnServer(page, threadId), { timeout: 15_000 }).toBe(false);

    // Back in the thread, its stream says it is not running: the sidebar agrees at once.
    await page
      .getByRole("link", { name: /shiny-app/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}`));
    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 3000 });
  });
});

// A run that fails says why where the reply would be, and keeps saying it to a page opened later
// (decision 0100), until the next run starts.
test.describe("a thread whose run failed", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("shows the error after a reload, not an empty reply", async ({ page }) => {
    await registerUser(page, "fail", "Failing Person");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS_AFTER: "300",
      FAKE_RUN_FAILS: "404 This model is not available.",
    });
    runner = child;

    // Sent while nobody has the thread open, as when someone leaves and comes back.
    const sent = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "work on it" },
    });
    expect(sent.ok()).toBe(true);
    await expect(async () => {
      const threads = (await (await page.request.get("/api/threads")).json()) as {
        id: string;
        running: boolean;
      }[];
      expect(threads.find((thread) => thread.id === threadId)?.running).toBe(false);
    }).toPass({ timeout: 10_000 });

    await page.goto(`/threads/${threadId}`);
    await expect(page.getByText("404 This model is not available.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("404 This model is not available.")).toBeVisible();
  });
});
