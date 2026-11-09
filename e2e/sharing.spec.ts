import type { ChildProcess } from "node:child_process";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  addRunner,
  connectGithub,
  importRepository,
  registerUser,
  threadOnFakeRunner,
} from "./helpers";

async function teammateOf(owner: Page, browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = await registerUser(page, "mate", "Mate Person");
  const invited = await owner.request.post("/api/auth/organization/invite-member", {
    data: { email, role: "member" },
    headers: { origin: "http://localhost:5174" },
  });
  expect(invited.ok()).toBe(true);
  const { id } = (await invited.json()) as { id: string };
  await page.goto(`/accept-invitation/${id}`);
  await page.getByRole("button", { name: "Join organization" }).click();
  await expect(page).toHaveURL(/\/threads$/);
  return { page, context };
}

test.describe("sharing a thread", () => {
  test("a thread is private until its creator shares it, and then it is read-only", async ({
    page,
    browser,
  }) => {
    await registerUser(page, "owner", "Owner Person");
    await addRunner(page);
    await connectGithub(page);
    await importRepository(page, "shiny-app");
    const [project] = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    const created = await page.request.post("/api/threads", {
      data: { projectId: project!.id, title: "Private plans" },
    });
    const thread = (await created.json()) as { id: string };

    const mate = await teammateOf(page, browser);
    const sidebar = (who: Page) => who.locator('[data-slot="sidebar"]');

    await mate.page.reload();
    await expect(sidebar(mate.page)).not.toContainText("Private plans");
    expect((await mate.page.request.get(`/api/threads/${thread.id}`)).status()).toBe(404);
    await mate.page.goto(`/threads/${thread.id}`);
    await expect(mate.page.getByRole("heading", { name: "Thread not found" })).toBeVisible();

    await page.goto(`/threads/${thread.id}`);
    const share = page.getByRole("button", { name: /^(Share|Shared to workspace)$/ });
    const dialog = page.getByRole("dialog", { name: "Share this thread" });
    const choose = async (name: RegExp) => {
      await share.click();
      await dialog.getByRole("radio", { name }).click();
      await dialog.getByRole("button", { name: "Done" }).click();
      await expect(dialog).toHaveCount(0);
    };
    await choose(/Everyone in the workspace/);
    await expect(page.getByText("Shared with the workspace")).toBeVisible();
    expect((await mate.page.request.get(`/api/threads/${thread.id}`)).status()).toBe(200);

    await choose(/Only me/);
    await expect(page.getByText("Only you can see it now")).toBeVisible();
    await expect(sidebar(page).getByRole("img", { name: "Shared with workspace" })).toHaveCount(0);
    expect((await mate.page.request.get(`/api/threads/${thread.id}`)).status()).toBe(404);

    await choose(/Everyone in the workspace/);
    await expect(sidebar(page).getByRole("img", { name: "Shared with workspace" })).toHaveCount(1);

    const processCalls: string[] = [];
    mate.page.on("request", (request) => {
      if (request.url().includes("/processes")) processCalls.push(request.url());
    });
    await mate.page.goto("/threads");
    await expect(sidebar(mate.page)).toContainText("Shared with workspace");
    await mate.page.keyboard.press("ControlOrMeta+k");
    await mate.page.keyboard.type("Private plans");
    await expect(mate.page.getByRole("option", { name: /Private plans/ })).toContainText(
      "Owner Person",
    );
    await mate.page.keyboard.press("Enter");
    await expect(mate.page).toHaveURL(new RegExp(`/threads/${thread.id}$`));
    await expect(mate.page.getByText(/Shared by/)).toContainText("Owner Person");
    await expect(mate.page.getByRole("textbox", { name: "Prompt" })).toHaveCount(0);
    await expect(
      mate.page.getByRole("button", { name: /^(Share|Shared to workspace)$/ }),
    ).toHaveCount(0);
    await expect(mate.page.getByRole("button", { name: "Desktop" })).toHaveCount(0);
    await expect(mate.page.getByRole("button", { name: "Terminal" })).toHaveCount(0);
    await expect(mate.page.getByRole("button", { name: "Files" })).toBeVisible();
    expect(processCalls).toEqual([]);
    const message = await mate.page.request.post(`/api/threads/${thread.id}/messages`, {
      data: { prompt: "hello" },
    });
    expect(message.status()).toBe(404);

    await page.request.put("/api/decision-model", {
      data: { kind: "jev-openrouter", apiKey: "sk-or-test-0000" },
    });
    await page.reload();
    await share.click();
    await dialog.getByRole("switch", { name: "Let teammates message this thread" }).click();
    await expect(page.getByText(/Teammates can message it for 7 days/)).toBeVisible();
    await expect(
      dialog.getByText(/It runs with your model, account and bill, and without your personal/),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    await mate.page.reload();
    await expect(mate.page.getByText(/Multiplayer is on/)).toContainText("Owner Person");
    await expect(mate.page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
    await expect(
      mate.page.getByRole("button", { name: /^(Share|Shared to workspace)$/ }),
    ).toHaveCount(0);
    const driven = await mate.page.request.post(`/api/threads/${thread.id}/messages`, {
      data: { prompt: "hello" },
    });
    expect(driven.status()).not.toBe(404);
    const archived = await mate.page.request.patch(`/api/threads/${thread.id}`, {
      data: { title: "Mine now" },
    });
    expect(archived.status()).toBe(404);
    const compacted = await mate.page.request.post(`/api/threads/${thread.id}/compact`, {
      data: {},
    });
    expect(compacted.status()).toBe(404);

    await share.click();
    await dialog.getByRole("switch", { name: "Let teammates message this thread" }).click();
    await expect(page.getByText("Multiplayer is off")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    const ended = await mate.page.request.post(`/api/threads/${thread.id}/messages`, {
      data: { prompt: "hello" },
    });
    expect(ended.status()).toBe(404);

    await mate.context.close();
  });

  test.describe("a mention in a multiplayer thread", () => {
    let runner: ChildProcess | undefined;
    test.afterEach(() => {
      runner?.kill();
      runner = undefined;
    });

    test("needs the workspace's decision model, and a message for a teammate does not wake the agent", async ({
      page,
      browser,
    }) => {
      await registerUser(page, "owner", "Owner Person");
      const provider = await page.request.post("/api/providers", {
        data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
      });
      expect(provider.ok()).toBe(true);
      const { child, events, threadId } = await threadOnFakeRunner(page);
      runner = child;
      const mate = await teammateOf(page, browser);

      await page.goto(`/threads/${threadId}`);
      const share = page.getByRole("button", { name: /^(Share|Shared to workspace)$/ });
      const dialog = page.getByRole("dialog", { name: "Share this thread" });
      const multiplayer = dialog.getByRole("switch", { name: "Let teammates message this thread" });
      await share.click();
      await dialog.getByRole("radio", { name: /Everyone in the workspace/ }).click();
      await expect(multiplayer).toBeDisabled();
      await expect(dialog.getByText("The workspace needs a decision model first.")).toBeVisible();
      await dialog.getByRole("button", { name: "Done" }).click();

      const saved = await page.request.put("/api/decision-model", {
        data: { kind: "jev-openrouter", apiKey: "sk-or-test-0000" },
      });
      expect(saved.ok()).toBe(true);
      expect(await (await page.request.get("/api/decision-model")).json()).toEqual({
        decisionModel: { kind: "jev-openrouter", modelId: "typesafe/jev-1.13", keyHint: "0000" },
      });
      await page.reload();
      await share.click();
      await expect(multiplayer).toBeEnabled();
      await multiplayer.click();
      await expect(page.getByText(/Teammates can message it for 7 days/)).toBeVisible();
      await dialog.getByRole("button", { name: "Done" }).click();

      const prompt = page.getByRole("textbox", { name: "Prompt" });
      const menu = page.getByRole("listbox", { name: "Mention" });
      await prompt.click();
      await page.keyboard.type("@Mate");
      await expect(menu.getByRole("option", { name: /Mate Person/ })).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(prompt.locator('[data-mention="person"]')).toContainText("Mate Person");
      await page.keyboard.type(" did you deploy the fix?");
      await page.keyboard.press("Enter");

      const sent = page.locator('[data-role="user"]');
      await expect(sent.locator('[data-mention="person"]')).toHaveText("@Mate Person");
      await expect(sent).toContainText("did you deploy the fix?");
      await page.reload();
      await expect(sent.locator('[data-mention="person"]')).toHaveText("@Mate Person");
      expect(events.filter((event) => event.type === "started")).toEqual([]);

      await prompt.click();
      await page.keyboard.type("fix the build");
      await page.keyboard.press("Enter");
      await expect.poll(() => events.some((event) => event.type === "started")).toBe(true);

      await mate.context.close();
    });
  });
});
