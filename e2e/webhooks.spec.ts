import { expect, test, type Page } from "@playwright/test";

import { registerUser } from "./helpers";

const bubble = (page: Page, text: string) =>
  page
    .locator('[data-slot="bubble-content"], [data-role="user"]')
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

test("a webhook is made in settings, and a delivery wakes the main bot and starts no thread", async ({
  page,
  request,
}) => {
  await registerUser(page, "webhooks", "Webhook User");
  const provider = await page.request.post("/api/providers", {
    data: {
      kind: "openai-compatible",
      name: "Fake",
      baseUrl: "http://localhost:8102/v1",
      modelId: "fake-model",
    },
  });
  expect(provider.ok()).toBe(true);

  await page.goto("/settings/webhooks");
  await expect(page.getByText("No webhooks yet")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Webhooks" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New webhook" }).click();
  await page.getByLabel("Name").fill("GitHub issues");
  await page.getByRole("button", { name: "Create webhook" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("GitHub issues is ready")).toBeVisible();
  const address = await dialog.getByLabel("Webhook address").textContent();
  expect(address).toMatch(/^http:\/\/localhost:\d+\/api\/webhooks\/[0-9a-f-]{36}\/avnwh_/);
  await dialog.getByRole("button", { name: "Done" }).click();

  const row = page.getByRole("list", { name: "Webhooks" }).getByRole("listitem");
  await expect(row).toContainText("GitHub issues");
  await expect(row).toContainText("No deliveries yet");

  const path = new URL(address!).pathname;
  const wrong = await request.post(path.replace(/[^/]+$/, "avnwh_wrong"), { data: "{}" });
  expect(wrong.status()).toBe(404);

  const delivered = await request.post(path, {
    headers: { "x-github-event": "issues" },
    data: {
      action: "opened",
      issue: { number: 42, title: "Crash on start", body: "It crashes." },
    },
  });
  expect(delivered.status()).toBe(202);

  await page.goto("/bot");
  await expect(bubble(page, "Webhook received: checking the report")).toBeVisible({
    timeout: 30_000,
  });
  expect(await (await page.request.get("/api/threads")).json()).toEqual([]);

  await page.goto("/settings/webhooks");
  await expect(row).toContainText("Sent to your main bot");
  await page.getByRole("switch", { name: "Use GitHub issues" }).click();
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Remove GitHub issues" }).click();
  await expect(page.getByText("No webhooks yet")).toBeVisible();
});
