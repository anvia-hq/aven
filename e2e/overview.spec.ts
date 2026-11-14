import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

async function newThread(page: Page) {
  await addRunner(page);
  await connectGithub(page);
  await page.goto("/threads");
  await importRepository(page, "docs-site");
  const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
  const made = await page.request.post("/api/threads", { data: { projectId: projects[0]!.id } });
  return ((await made.json()) as { id: string }).id;
}

async function streamSnapshot(page: Page, snapshot: Record<string, unknown>) {
  await page.route("**/api/threads/*/events", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `retry: 600000\n\ndata: ${JSON.stringify({ type: "snapshot", running: false, messages: [], ...snapshot })}\n\n`,
    }),
  );
}

const usage = {
  totals: {
    inputTokens: 80_000,
    outputTokens: 3_400,
    cacheWriteTokens: 5_600,
    cacheReadTokens: 70_000,
  },
  context: { usedTokens: 330_000, contextWindow: 1_000_000 },
};

test.describe("a thread's overview", () => {
  test("shows where the agent works, and context once the model reports it", async ({ page }) => {
    await registerUser(page, "ins", "Overview User");
    await streamSnapshot(page, { usage });
    const threadId = await newThread(page);
    await page.setViewportSize({ width: 1400, height: 760 });
    await page.goto(`/threads/${threadId}`);

    const environment = page.getByRole("region", { name: "Environment" });
    await expect(environment).toContainText("runner");
    await expect(environment.getByLabel("Offline")).toBeVisible();
    await expect(environment).toContainText("docs-site");
    await expect(environment).toContainText("acme/docs-site");
    await expect(environment).toContainText(`aven/${threadId.slice(0, 8)}`);

    const context = page.getByRole("region", { name: "Context" });
    await expect(context).toContainText("33% used");
    await expect(context).toContainText("330K / 1M");

    const tokens = page.getByRole("region", { name: "Usage" });
    await expect(tokens.getByText("Input", { exact: true }).locator("..")).toContainText("80K");
    await expect(tokens.getByText("Output", { exact: true }).locator("..")).toContainText("3.4K");
    await expect(tokens.getByText("Cache write", { exact: true }).locator("..")).toContainText(
      "5.6K",
    );
    await expect(tokens.getByText("Cache read", { exact: true }).locator("..")).toContainText(
      "70K",
    );
    await expect(tokens.getByText("Uncached", { exact: true }).locator("..")).toContainText("4.4K");
  });

  test("says when the context size is not known", async ({ page }) => {
    await registerUser(page, "ins", "Overview User");
    await streamSnapshot(page, {});
    const threadId = await newThread(page);
    await page.goto(`/threads/${threadId}`);

    await expect(page.getByRole("region", { name: "Context" })).toContainText(
      "Shown after the agent's first reply",
    );
  });
});

test("the overview can be closed and opened again from the thread toolbar", async ({ page }) => {
  await registerUser(page, "ins", "Overview User");
  await streamSnapshot(page, {});
  const threadId = await newThread(page);
  await page.setViewportSize({ width: 1400, height: 760 });
  await page.goto(`/threads/${threadId}`);

  const overview = page.getByRole("complementary", { name: "Overview" });
  await expect(overview).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(overview).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await expect(overview).toHaveCount(0);
});

function serveEvents(events: unknown[], gapMs: number) {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "access-control-allow-origin": "*",
    });
    response.write("retry: 600000\n\n");
    let sent = 0;
    const next = () => {
      const event = events[sent++];

      if (!event) return response.end();

      response.write(`data: ${JSON.stringify(event)}\n\n`);
      setTimeout(next, sent < 3 ? 0 : gapMs);
    };
    next();
  }).listen(0);
  return {
    url: `http://localhost:${(server.address() as AddressInfo).port}/`,
    close() {
      server.close();
      server.closeAllConnections();
    },
  };
}

async function openStreamingThread(page: Page, words: number, gapMs: number) {
  await registerUser(page, "ins", "Overview User");
  const history = Array.from({ length: 20 }, (_, index) => [
    { id: `u${index}`, role: "user", parts: [{ type: "text", text: `Question ${index}` }] },
    { id: `a${index}`, role: "assistant", parts: [{ type: "text", text: `Answer ${index}` }] },
  ]).flat();
  const stream = serveEvents(
    [
      { type: "snapshot", running: true, messages: history },
      { type: "run_start", prompt: "Stream please" },
      ...Array.from({ length: words }, (_, index) => ({
        type: "text",
        delta: `word${index} \n\n`,
      })),
      { type: "done" },
    ],
    gapMs,
  );
  const threadId = await newThread(page);
  await page.route("**/api/threads/*/events", (route) => route.continue({ url: stream.url }));
  await page.goto(`/threads/${threadId}`);
  return stream;
}

test("the conversation follows a streaming answer, with its end clear of the composer", async ({
  page,
}) => {
  const stream = await openStreamingThread(page, 80, 25);
  try {
    const last = page.locator('[data-role="assistant"]').last();
    const prompt = page.getByRole("textbox", { name: "Prompt" });
    await expect(last).toContainText("word79", { timeout: 15_000 });
    await expect
      .poll(async () => {
        const [message, composer] = await Promise.all([last.boundingBox(), prompt.boundingBox()]);
        return composer!.y - (message!.y + message!.height);
      })
      .toBeGreaterThan(24);
  } finally {
    stream.close();
  }
});

test("a reader who scrolled up is not pulled back down by the answer streaming in", async ({
  page,
}) => {
  const stream = await openStreamingThread(page, 80, 25);
  try {
    const last = page.locator('[data-role="assistant"]').last();
    await expect(last).toContainText("word10", { timeout: 15_000 });
    const scroller = page
      .locator('[data-role="user"]')
      .first()
      .locator("xpath=ancestor::div[contains(@class, 'overflow-y-auto')][1]");
    await scroller.evaluate((element) => (element.scrollTop = 0));
    await expect(last).toContainText("word79", { timeout: 15_000 });
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeLessThan(100);
  } finally {
    stream.close();
  }
});

test("text that arrives in one burst is paced out, not shown at once", async ({ page }) => {
  await registerUser(page, "pace", "Pace User");
  const words = Array.from({ length: 80 }, (_, index) => `word${index}`);
  const stream = serveEvents(
    [
      { type: "snapshot", running: true, messages: [] },
      { type: "run_start", prompt: "Stream please" },
      { type: "text", delta: " " },
      { type: "text", delta: words.join(" ") },
      { type: "done" },
    ],
    1_000,
  );
  try {
    const threadId = await newThread(page);
    await page.route("**/api/threads/*/events", (route) => route.continue({ url: stream.url }));
    await page.goto(`/threads/${threadId}`);
    const last = page.locator('[data-role="assistant"]').last();
    await expect(last).toContainText("word0");
    expect(await last.textContent()).not.toContain(words.at(-1));
    await expect(last).toContainText(words.at(-1)!);
  } finally {
    stream.close();
  }
});

test("the column keeps its height while another thread's usage arrives", async ({ page }) => {
  await registerUser(page, "ins", "Overview User");
  await addRunner(page);
  await connectGithub(page);
  await page.goto("/threads");
  await importRepository(page, "docs-site");
  const [project] = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
  const ids: string[] = [];
  for (let index = 0; index < 2; index++) {
    const made = await page.request.post("/api/threads", { data: { projectId: project!.id } });
    ids.push(((await made.json()) as { id: string }).id);
  }
  let secondServed = false;
  await page.route("**/api/threads/*/events", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `retry: 600000\n\ndata: ${JSON.stringify({ type: "snapshot", running: false, messages: [], usage })}\n\n`,
    });

    if (route.request().url().includes(ids[1]!)) secondServed = true;
  });
  await page.setViewportSize({ width: 1500, height: 800 });
  await page.goto(`/threads/${ids[0]}`);
  const overview = page.getByRole("complementary", { name: "Overview" });
  await expect(page.getByRole("region", { name: "Context" })).toContainText("33% used");
  await expect(overview).toContainText("docs-site · acme/docs-site");

  await page.evaluate(() => {
    const heights = new Set<number>();
    (window as unknown as { __heights: Set<number> }).__heights = heights;
    const sample = () => {
      const aside = document.querySelector('aside[aria-label="Overview"]');
      heights.add(aside ? Math.round(aside.getBoundingClientRect().height) : 0);
      requestAnimationFrame(sample);
    };
    sample();
  });
  await page.locator(`a[href="/threads/${ids[1]}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/threads/${ids[1]}$`));
  await expect.poll(() => secondServed).toBe(true);
  await expect(page.getByRole("region", { name: "Context" })).toContainText("33% used");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  const heights = await page.evaluate(() => [
    ...(window as unknown as { __heights: Set<number> }).__heights,
  ]);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
});
