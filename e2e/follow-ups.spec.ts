import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("follow-up suggestions", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("Settings keeps the switch and the model for the person", async ({ page }) => {
    await registerUser(page, "fu", "Follow User");
    await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    await page.goto("/settings/general");
    const toggle = page.getByRole("switch", { name: "Follow-up suggestions" });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.reload();
    await expect(page.getByRole("switch", { name: "Follow-up suggestions" })).toBeChecked();
  });

  test("buttons follow a finished reply, and pressing one sends it", async ({ page }) => {
    await registerUser(page, "fb", "Buttons User");
    await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    const providers = (await (await page.request.get("/api/providers")).json()) as {
      id: string;
    }[];
    await page.request.put("/api/preferences/follow-ups", {
      data: { enabled: true, providerId: providers[0]!.id, modelId: null },
    });
    await page.route("**/api/threads/*/follow-ups", (route) => {
      return route.fulfill({
        json: { suggestions: ["Go with Box cards", "Box cards, but drop the cost total"] },
      });
    });
    const { child, events, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS: "1" });
    runner = child;
    await page.goto(`/threads/${threadId}`);
    await page.getByRole("textbox", { name: "Prompt" }).click();
    await page.keyboard.type("Make the overview better");
    await page.keyboard.press("Enter");

    const chips = page.getByRole("list", { name: "Suggested replies" });
    await expect(chips.getByRole("button")).toHaveCount(2);

    await chips.getByRole("button", { name: "Go with Box cards" }).click();
    await expect(chips).toHaveCount(0);
    await expect
      .poll(() => events.filter((event) => event.type === "started").length)
      .toBeGreaterThan(1);
    expect(events.filter((event) => event.type === "started").at(-1)).toMatchObject({
      prompt: "Go with Box cards",
    });
  });
});
