import { expect, test, type Browser, type Page } from "@playwright/test";

import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

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
    const share = page.getByRole("button", { name: "Who can see this thread" });
    const choose = async (name: RegExp) => {
      await share.click();
      await page.getByRole("menuitemradio", { name }).click();
      await expect(page.getByRole("menu")).toHaveCount(0);
    };
    await choose(/Everyone in the workspace/);
    await expect(page.getByText("Shared with the workspace")).toBeVisible();
    await expect(share).toContainText("Shared");
    expect((await mate.page.request.get(`/api/threads/${thread.id}`)).status()).toBe(200);

    await choose(/Only me/);
    await expect(page.getByText("Only you can see it now")).toBeVisible();
    await expect(share).toContainText("Private");
    await expect(sidebar(page).getByRole("img", { name: "Shared with workspace" })).toHaveCount(0);
    expect((await mate.page.request.get(`/api/threads/${thread.id}`)).status()).toBe(404);

    await choose(/Everyone in the workspace/);
    await expect(share).toContainText("Shared");
    await expect(sidebar(page).getByRole("img", { name: "Shared with workspace" })).toHaveCount(1);

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
    await expect(mate.page.getByRole("button", { name: "Who can see this thread" })).toHaveCount(0);
    await expect(mate.page.getByRole("button", { name: "Desktop" })).toHaveCount(0);
    await expect(mate.page.getByRole("button", { name: "Terminal" })).toHaveCount(0);
    await expect(mate.page.getByRole("button", { name: "Files" })).toBeVisible();
    const message = await mate.page.request.post(`/api/threads/${thread.id}/messages`, {
      data: { prompt: "hello" },
    });
    expect(message.status()).toBe(404);

    await mate.context.close();
  });
});
