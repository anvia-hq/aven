import { expect, test, type Page } from "@playwright/test";

import { addSubscription, registerUser } from "./helpers";

const CLAUDE_TOKEN = "sk-ant-oat01-e2e-bot-subscription-9f3a";
const CODEX_ACCESS = "e2e-bot-access-9f3a";
const CODEX_KEY = JSON.stringify({
  auth_mode: "chatgpt",
  tokens: { access_token: CODEX_ACCESS, refresh_token: "e2e-bot-refresh-9f3a" },
});

const CLAUDE_REPLY = "The Claude backend is answering this thread.";
const CODEX_REPLY = "The Codex backend is answering this thread.";

const bubble = (page: Page, text: string) =>
  page
    .locator('[data-slot="bubble-content"], [data-role="user"]')
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

async function mainBotId(page: Page) {
  const bots = (await (await page.request.get("/api/bots")).json()) as {
    id: string;
    isMain: boolean;
  }[];
  return bots.find((bot) => bot.isMain)!.id;
}

async function botOn(
  page: Page,
  prefix: string,
  kind: "claude-subscription" | "codex-subscription",
  modelId: string,
  credential: string,
) {
  await registerUser(page, prefix, "Bot Subscription");
  const providerId = await addSubscription(page, kind, credential);
  const id = await mainBotId(page);
  const patched = await page.request.patch(`/api/bots/${id}`, {
    data: { providerId, modelId },
  });
  expect(patched.ok(), await patched.text()).toBe(true);
  await page.goto("/bot");
  return id;
}

test.describe("a bot on a subscription", () => {
  test.setTimeout(120_000);

  test("answers on the Claude agent its provider names, and keeps the chat", async ({ page }) => {
    await botOn(page, "botclaude", "claude-subscription", "sonnet", CLAUDE_TOKEN);
    const answered = bubble(page, CLAUDE_REPLY);

    await expect(answered).toHaveCount(1, { timeout: 60_000 });

    await page.getByRole("textbox", { name: "Message" }).fill("say hello");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(answered).toHaveCount(2, { timeout: 60_000 });

    await page.reload();
    await expect(answered).toHaveCount(2, { timeout: 60_000 });
    await expect(page.getByText(CLAUDE_TOKEN)).toHaveCount(0);
  });

  test("answers on the Codex agent its provider names, and keeps the chat", async ({ page }) => {
    await botOn(page, "botcodex", "codex-subscription", "sol", CODEX_KEY);
    const answered = bubble(page, CODEX_REPLY);

    await expect(answered).toHaveCount(1, { timeout: 60_000 });

    await page.getByRole("textbox", { name: "Message" }).fill("say hello");
    await page.getByRole("textbox", { name: "Message" }).press("Enter");
    await expect(answered).toHaveCount(2, { timeout: 60_000 });

    await page.reload();
    await expect(answered).toHaveCount(2, { timeout: 60_000 });
    await expect(page.getByText(CODEX_ACCESS)).toHaveCount(0);
  });
});
