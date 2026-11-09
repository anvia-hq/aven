import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("two threads side by side", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("a thread dragged from the sidebar onto the page opens beside the open one, and closes", async ({
    page,
  }) => {
    await registerUser(page, "spl", "Split User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    const created = await page.request.post("/api/threads", {
      data: { projectId: projects[0]!.id },
    });
    const other = (await created.json()) as { id: string };
    await page.request.patch(`/api/threads/${other.id}`, { data: { title: "Second thread" } });
    await page.setViewportSize({ width: 1500, height: 800 });
    await page.goto(`/threads/${threadId}`);
    await expect(page.locator("header h1")).toHaveCount(1);

    const zone = page.locator('[data-slot="split-drop-zone"]');
    const box = (await zone.boundingBox())!;
    await page
      .getByRole("link", { name: /Second thread/ })
      .dragTo(zone, { targetPosition: { x: box.width - 80, y: 300 } });

    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}\\?split=${other.id}`));
    await expect(page.locator("header h1")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Close Second thread" })).toBeVisible();

    await page.getByRole("button", { name: "Close Second thread" }).click();
    await expect(page).toHaveURL(new RegExp(`/threads/${threadId}$`));
    await expect(page.locator("header h1")).toHaveCount(1);
  });
});
