import type { ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

test.describe("shipping a thread", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("sends the agent the ship prompt, and the pull request it opens shows up with a link", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    // The run needs a model grant; the pretend runner never calls the model.
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const { child, events, threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS: "1" });
    runner = child;

    await page.goto(`/threads/${threadId}`);
    await expect(page.getByRole("link", { name: /#7/ })).toHaveCount(0);
    // What would be shipped, as lines added and removed, beside the button above the composer.
    await expect(page.getByTitle("Changes not shipped yet")).toHaveText("+2 -1");

    // The agent opens the pull request with gh, as the person (the pretend GitHub keeps it).
    await page.request.post("http://localhost:8101/repos/acme/shiny-app/pulls");
    await page.getByRole("button", { name: "Ship", exact: true }).click();

    await expect(page.getByText("The agent is working on it in this thread")).toBeVisible();
    // The agent was sent the default ship prompt, with where the thread is.
    await expect.poll(() => events.find((event) => event.type === "started")).toBeTruthy();
    const prompt = String(events.find((event) => event.type === "started")?.prompt);
    expect(prompt).toContain("gh pr create --draft");
    expect(prompt).toContain(`This thread's branch is aven/${threadId.slice(0, 8)}`);
    expect(prompt).toContain("default branch is main");

    // Once the run has ended, the control plane has found the pull request for the thread's branch.
    await expect(page.getByRole("link", { name: /#7/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/pull/7",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("button", { name: "Update PR" })).toBeVisible();

    // It survives a reload, since it is kept on the thread.
    await page.reload();
    await expect(page.getByRole("link", { name: /#7/ })).toBeVisible();
  });

  test("a person who has not connected GitHub is offered to, and comes back to the thread", async ({
    page,
  }) => {
    await registerUser(page, "shp", "Ship User");
    const { child, threadId } = await threadOnFakeRunner(page);
    runner = child;
    await page.route("**/api/github/user", (route) =>
      route.fulfill({ json: { connected: false, login: null } }),
    );

    await page.goto(`/threads/${threadId}`);

    const connect = page.getByRole("button", { name: "Connect GitHub to ship" });
    await expect(connect).toHaveAttribute(
      "href",
      `/api/github/connect?next=${encodeURIComponent(`/threads/${threadId}`)}`,
    );
    await expect(page.getByRole("button", { name: "Ship", exact: true })).toHaveCount(0);
  });
});
