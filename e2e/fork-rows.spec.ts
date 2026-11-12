import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.use({ deviceScaleFactor: 3 });

test.describe("forked threads in the sidebar", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("a fork has an icon, not a label, and an elbow that joins it to its parent", async ({
    page,
  }) => {
    await registerUser(page, "frk", "Fork User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    const made = [] as string[];
    for (const title of ["First fork", "Second fork"]) {
      const response = await page.request.post("/api/threads", {
        data: { projectId: projects[0]!.id },
      });
      const thread = (await response.json()) as { id: string };
      await page.request.patch(`/api/threads/${thread.id}`, { data: { title } });
      made.push(thread.id);
    }
    await page.route("**/api/threads", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();

      const response = await route.fetch();
      const list = (await response.json()) as { id: string; parentThreadId?: string | null }[];
      for (const thread of list) {
        if (made.includes(thread.id)) thread.parentThreadId = threadId;
      }
      return route.fulfill({ response, json: list });
    });
    await page.setViewportSize({ width: 1400, height: 760 });
    await page.goto(`/threads/${threadId}`);

    await expect(page.getByRole("link", { name: /First fork/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Fork" })).toHaveCount(2);
    await expect(page.getByText("Fork", { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-slot="fork-elbow"]')).toHaveCount(2);
    await page.screenshot({
      path: ".aven/proof/forks/after.png",
      clip: { x: 0, y: 0, width: 420, height: 400 },
    });
  });
});
