import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("a repository's actions", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("a command runs in the sandbox and lands in Background tasks, a failure can be handed to the agent, a prompt goes to the agent", async ({
    page,
  }) => {
    await registerUser(page, "act", "Actions User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship,actions",
    });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await expect(page.getByRole("button", { name: "Test", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Typecheck" })).toBeVisible();

    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(page.getByText("Running in the sandbox, under Background tasks")).toBeVisible();
    await expect(page.getByText("Finished", { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Typecheck" }).click();
    await expect(page.getByText("Exited with code 2")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Ask the agent to fix bun run typecheck/ }).click();
    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    const fix = String(events.find((event) => event.type === "started")?.prompt);
    expect(fix).toContain("`bun run typecheck` failed with exit code 2");
    expect(fix).toContain("error TS2322");
  });

  test("a prompt action sends the agent its text", async ({ page }) => {
    await registerUser(page, "act", "Actions User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, {
      FAKE_RUN_ENDS: "1",
      FAKE_AVEN_FILES: "setup,ship,actions",
    });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Tidy up" }).click();
    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    expect(String(events.find((event) => event.type === "started")?.prompt)).toBe(
      "Remove dead code and unused imports",
    );
  });
});
