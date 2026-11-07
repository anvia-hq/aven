import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("the agent's question", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("stops the run until it is answered, then continues in the same message", async ({
    page,
  }) => {
    await registerUser(page, "ask", "Ask User");
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, { FAKE_QUESTION: "1" });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("textbox", { name: "Prompt" }).fill("paint it");
    await page.getByRole("button", { name: "Send" }).click();

    const form = page.getByRole("form", { name: "Answer the agent" });
    await expect(form).toBeVisible();
    await expect(form).toContainText("Which color should it be?");
    await expect(page.getByRole("textbox", { name: "Prompt" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Answered questions" })).toHaveCount(0);
    const refused = await page.request.post(`/api/threads/${threadId}/messages`, {
      data: { prompt: "never mind" },
    });
    expect(refused.status()).toBe(409);

    await expect(form.getByRole("button", { name: "Send answer" })).toBeDisabled();
    await form.getByRole("radio", { name: "Blue" }).click();
    await form.getByRole("button", { name: "Send answer" }).click();

    await expect(page.getByText("Thanks, on it.")).toBeVisible();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Answered questions" }).getByText("blue"),
    ).toBeVisible();
    await expect(async () => {
      expect(events.find((entry) => entry.type === "answered")).toMatchObject({
        response: { type: "tool-question", answers: [{ questionId: "color", value: "blue" }] },
      });
    }).toPass({ timeout: 5000 });

    const again = await page.request.post(`/api/threads/${threadId}/answer`, {
      data: { answers: [{ questionId: "color", value: "red" }] },
    });
    expect(again.status()).toBe(409);
  });

  test("your own words answer a question that allows them", async ({ page }) => {
    await registerUser(page, "ask", "Ask User");
    await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    const { child, events, threadId } = await threadOnFakeRunner(page, { FAKE_QUESTION: "1" });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("textbox", { name: "Prompt" }).fill("paint it");
    await page.getByRole("button", { name: "Send" }).click();

    const form = page.getByRole("form", { name: "Answer the agent" });
    await form.getByRole("radio", { name: "Red" }).click();
    await form.getByLabel("Which color should it be? (your own answer)").fill("teal");
    await expect(form.getByRole("radio", { name: "Red" })).not.toBeChecked();
    await form.getByRole("button", { name: "Send answer" }).click();

    await expect(page.getByText("Thanks, on it.")).toBeVisible();
    await expect(async () => {
      expect(events.find((entry) => entry.type === "answered")).toMatchObject({
        response: { answers: [{ questionId: "color", value: "teal" }] },
      });
    }).toPass({ timeout: 5000 });
  });

  test("several questions are asked one screen at a time", async ({ page }) => {
    await registerUser(page, "ask", "Ask User");
    await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    const { child, events, threadId } = await threadOnFakeRunner(page, { FAKE_QUESTION: "2" });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await page.getByRole("textbox", { name: "Prompt" }).fill("paint it");
    await page.getByRole("button", { name: "Send" }).click();

    const form = page.getByRole("form", { name: "Answer the agent" });
    await expect(form).toContainText("1 of 2");
    await expect(form).toContainText("How big is it?");
    await expect(form).not.toContainText("Which color should it be?");
    await expect(form.getByRole("button", { name: "Next" })).toBeDisabled();
    await form.getByRole("radio", { name: "Large" }).click();
    await form.getByRole("button", { name: "Next" }).click();

    await expect(form).toContainText("2 of 2");
    await expect(form).toContainText("Which color should it be?");
    await form.getByRole("button", { name: "Back" }).click();
    await expect(form.getByRole("radio", { name: "Large" })).toBeChecked();
    await form.getByRole("button", { name: "Next" }).click();

    await form.getByRole("radio", { name: "Red" }).click();
    await form.getByRole("button", { name: "Send answer" }).click();
    await expect(page.getByText("Thanks, on it.")).toBeVisible();
    await expect(async () => {
      expect(events.find((entry) => entry.type === "answered")).toMatchObject({
        response: {
          answers: [
            { questionId: "size", value: "large" },
            { questionId: "color", value: "red" },
          ],
        },
      });
    }).toPass({ timeout: 5000 });
  });
});
