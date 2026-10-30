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

// Stands in for the event stream so no model is needed.
async function streamSnapshot(page: Page, snapshot: Record<string, unknown>) {
  await page.route("**/api/threads/*/events", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `retry: 600000\n\ndata: ${JSON.stringify({ type: "snapshot", running: false, messages: [], ...snapshot })}\n\n`,
    }),
  );
}

test.describe("a thread's overview", () => {
  test("shows where the agent works, and context once the model reports it", async ({ page }) => {
    await registerUser(page, "ins", "Inspector User");
    await streamSnapshot(page, { context: { usedTokens: 330_000, contextWindow: 1_000_000 } });
    const threadId = await newThread(page);
    await page.setViewportSize({ width: 1400, height: 760 });
    await page.goto(`/threads/${threadId}`);

    const environment = page.getByRole("region", { name: "Environment" });
    await expect(environment).toContainText("runner · offline");
    await expect(environment).toContainText("docs-site");
    await expect(environment).toContainText("acme/docs-site");
    await expect(environment).toContainText(`aven/${threadId.slice(0, 8)}`);

    const context = page.getByRole("region", { name: "Context" });
    await expect(context).toContainText("33% used");
    await expect(context).toContainText("330K / 1M");
  });

  test("says when the context size is not known", async ({ page }) => {
    await registerUser(page, "ins", "Inspector User");
    await streamSnapshot(page, {});
    const threadId = await newThread(page);
    await page.goto(`/threads/${threadId}`);

    await expect(page.getByRole("region", { name: "Context" })).toContainText(
      "Shown after the agent's first reply",
    );
  });
});

test("the overview can be closed and opened again from the thread toolbar", async ({ page }) => {
  await registerUser(page, "ins", "Inspector User");
  await streamSnapshot(page, {});
  const threadId = await newThread(page);
  await page.setViewportSize({ width: 1400, height: 760 });
  await page.goto(`/threads/${threadId}`);

  const overview = page.getByRole("complementary", { name: "Overview" });
  await expect(overview).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(overview).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Prompt")).toBeVisible();
  await expect(overview).toHaveCount(0);
});
