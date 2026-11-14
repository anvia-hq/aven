import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a thread that is running", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function startRun(page: Page) {
    await registerUser(page, "pls", "Pulse Person");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS_AFTER: "4000" });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    const sent = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "work on it" },
    });
    expect(sent.ok()).toBe(true);
    await expect(page.getByRole("img", { name: "Working" })).toHaveCount(1);
    return threadId;
  }

  const runningOnServer = async (page: Page, threadId: string) => {
    const threads = (await (await page.request.get("/api/threads")).json()) as {
      id: string;
      running: boolean;
    }[];
    return threads.find((thread) => thread.id === threadId)?.running;
  };

  test("loses its working dots in the sidebar when its run ends while another page is open", async ({
    page,
  }) => {
    const threadId = await startRun(page);

    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);

    await expect.poll(() => runningOnServer(page, threadId), { timeout: 15_000 }).toBe(false);

    await expect(page.getByRole("img", { name: "Working" })).toHaveCount(0, { timeout: 15_000 });
  });

  test("a thread that began running while the sidebar thought it idle shows its dots once it is opened", async ({
    page,
  }) => {
    await registerUser(page, "pls", "Pulse Person");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS_AFTER: "30000" });
    runner = child;

    await page.goto("/projects");
    await expect(page.getByRole("img", { name: "Working" })).toHaveCount(0);
    const sent = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "work on it" },
    });
    expect(sent.ok()).toBe(true);

    await page
      .getByRole("link", { name: /shiny-app/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}`));
    await expect(page.getByRole("img", { name: "Working" })).toHaveCount(1, { timeout: 3000 });
  });

  test("a thread opened after its run ended does not keep its working dots in the sidebar", async ({
    page,
  }) => {
    const threadId = await startRun(page);
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect.poll(() => runningOnServer(page, threadId), { timeout: 15_000 }).toBe(false);

    await page
      .getByRole("link", { name: /shiny-app/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}`));
    await expect(page.getByText("Shown after the agent's first reply")).toBeVisible();
    expect(await page.getByRole("img", { name: "Working" }).count()).toBe(0);
  });
});

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
