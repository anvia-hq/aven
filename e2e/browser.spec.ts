import type { ChildProcess } from "node:child_process";

import { expect, request as playwright, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8100";
const BROWSER_ORIGIN = process.env.E2E_BROWSER_ORIGIN ?? "http://localhost:8104";

async function openBrowser(page: Page, threadId: string) {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto(`/threads/${threadId}`);
  await page.getByRole("button", { name: "Browser", exact: true }).click();
  return page.getByRole("region", { name: "Browser" });
}

async function showPort(panel: ReturnType<Page["getByRole"]>, port: string) {
  await panel.getByRole("textbox", { name: "Port" }).fill(port);
  await panel.getByRole("button", { name: "Open", exact: true }).click();
  return panel.frameLocator('iframe[title="Browser"]');
}

test.describe("a thread's Browser", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("shows a page the sandbox serves, from an origin of its own, with the app's cookies kept apart", async ({
    page,
  }) => {
    await registerUser(page, "brw", "Browser User");
    const { child, events, threadId } = await threadOnFakeRunner(page);
    runner = child;

    const panel = await openBrowser(page, threadId);
    await expect(panel).toContainText("type the port");
    const frame = await showPort(panel, "3000");

    await expect(frame.getByRole("heading", { name: "Hello from the sandbox" })).toBeVisible();
    await expect(frame.locator("#out")).toHaveText(`script ran on ${BROWSER_ORIGIN}`);
    await expect(frame.locator("#seen")).toContainText("host=localhost:3000");
    await expect(frame.locator("#seen")).not.toContainText("session");
    await expect(frame.locator("#seen")).not.toContainText("aven-browser");
    expect(events.some((entry) => entry.type === "port.open" && entry.port === 3000)).toBe(true);

    await panel.getByRole("button", { name: "Reload" }).click();
    await expect(frame.locator("#seen")).toContainText("cookie=theme=dark");

    await frame.locator("#old").click();
    await expect(frame.getByRole("heading", { name: "Hello from the sandbox" })).toBeVisible();
    expect(events.some((entry) => entry.type === "port.request" && entry.path === "/old")).toBe(
      true,
    );

    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === "aven-app.theme")).toBe(true);
    const newTab = panel.getByRole("link", { name: "Open in a new tab" });
    expect(await newTab.getAttribute("href")).toContain(`${BROWSER_ORIGIN}/__aven/enter?ticket=`);
  });

  test("a page of the sandbox cannot make Aven change something", async ({ page }) => {
    await registerUser(page, "brc", "Browser Csrf User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    const panel = await openBrowser(page, threadId);
    const frame = await showPort(panel, "3000");
    await expect(frame.getByRole("heading", { name: "Hello from the sandbox" })).toBeVisible();

    const answered = page.waitForResponse(
      (response) => response.url() === `${API_URL}/threads/${threadId}/desktop/wake`,
    );
    await frame.locator("body").evaluate(async (_body, url) => {
      await fetch(url, { method: "POST", credentials: "include", mode: "no-cors" }).catch(
        () => undefined,
      );
    }, `${API_URL}/threads/${threadId}/desktop/wake`);
    expect((await answered).status()).toBe(403);
  });

  test("says so when nothing listens on the port, and when the link is not one that was given", async ({
    page,
  }) => {
    await registerUser(page, "brn", "Browser Nothing User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    const panel = await openBrowser(page, threadId);
    const frame = await showPort(panel, "4000");
    await expect(frame.locator("body")).toContainText("Nothing answered on port 4000");

    const stranger = await playwright.newContext();
    const refused = await stranger.get(`${BROWSER_ORIGIN}/__aven/enter?ticket=made-up`);
    expect(refused.status()).toBe(403);
    const bare = await stranger.get(`${BROWSER_ORIGIN}/`);
    expect(bare.status()).toBe(401);
    await stranger.dispose();
  });

  test("offers to wake a sandbox that is off, and then shows the page", async ({ page }) => {
    await registerUser(page, "brs", "Browser Wake User");
    const { child, threadId } = await threadOnFakeRunner(page, { NO_SANDBOX: "1" });
    runner = child;

    const panel = await openBrowser(page, threadId);
    await panel.getByRole("button", { name: "Wake up" }).click();
    const frame = await showPort(panel, "3000");
    await expect(frame.getByRole("heading", { name: "Hello from the sandbox" })).toBeVisible();
  });

  test("gives a ticket to a person who can read the thread, and to no one from another workspace", async ({
    page,
    browser,
    baseURL,
  }) => {
    await registerUser(page, "brm", "Browser Member User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;

    const response = await page.request.post(`/api/threads/${threadId}/browser`, {
      data: { port: 3000 },
    });
    expect(response.ok()).toBe(true);
    const { url } = (await response.json()) as { url: string };
    expect(url).toContain(`${BROWSER_ORIGIN}/__aven/enter?ticket=`);
    const bad = await page.request.post(`/api/threads/${threadId}/browser`, {
      data: { port: 70000 },
    });
    expect(bad.ok()).toBe(false);

    const other = await browser.newContext({ baseURL });
    const otherPage = await other.newPage();
    await registerUser(otherPage, "bro", "Browser Other User");
    const refused = await otherPage.request.post(`/api/threads/${threadId}/browser`, {
      data: { port: 3000 },
    });
    expect(refused.status()).toBe(404);
    await other.close();
  });
});
