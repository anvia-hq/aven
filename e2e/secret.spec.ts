import type { ChildProcess } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const SECRET = "sk_test_super_secret_value_1234";

// The agent's request for a secret (decision 0047) on a runner that asks for one and stops, and
// finishes once it is answered (e2e/fake-runner.ts, FAKE_SECRET).
test.describe("the agent asks for a secret", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  async function startRequest(page: Page) {
    await registerUser(page, "secret", "Secret User");
    // The run needs a model grant; the pretend runner never calls the model.
    const provider = await page.request.post("/api/providers", {
      data: { kind: "anthropic", name: "Anthropic", apiKey: "sk-ant-test" },
    });
    expect(provider.ok()).toBe(true);
    const started = await threadOnFakeRunner(page, { FAKE_SECRET: "1" });
    runner = started.child;
    await page.goto(`/threads/${started.threadId}`);
    await page.getByRole("textbox", { name: "Prompt" }).fill("set up stripe");
    await page.getByRole("button", { name: "Send" }).click();
    const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    return { ...started, projectId: projects[0]!.id };
  }

  test("is answered in a masked form; the value is stored and never reaches the agent or the page", async ({
    page,
  }) => {
    const { events, projectId } = await startRequest(page);

    const form = page.getByRole("form", { name: "Provide a secret" });
    await expect(form).toBeVisible();
    await expect(form).toContainText("What is the Stripe test key?");
    await expect(form).toContainText("STRIPE_API_KEY");
    // A message cannot go around it, and nothing is sent until there is a value.
    await expect(page.getByRole("textbox", { name: "Prompt" })).toHaveCount(0);
    await expect(form.getByRole("button", { name: "Store and continue" })).toBeDisabled();

    const field = form.getByLabel("What is the Stripe test key?");
    await expect(field).toHaveAttribute("type", "password");
    await field.fill(SECRET);
    await form.getByRole("button", { name: "Store and continue" }).click();

    await expect(page.getByText("Thanks, on it.")).toBeVisible();
    await expect(form).toHaveCount(0);
    const answered = page.getByRole("region", { name: "Answered questions" });
    await expect(answered).toContainText("stored as STRIPE_API_KEY");
    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();

    // The runner was told it was stored, never the value; it has the value as a secret variable
    // for the run that resumed, which is how its commands get it.
    await expect(async () => {
      expect(events.find((entry) => entry.type === "answered")).toMatchObject({
        response: {
          type: "tool-question",
          answers: [{ questionId: "STRIPE_API_KEY", value: "stored as STRIPE_API_KEY" }],
        },
        env: [{ name: "STRIPE_API_KEY", value: SECRET, secret: true }],
      });
    }).toPass({ timeout: 5000 });
    const answeredEvent = events.find((entry) => entry.type === "answered")!;
    expect(JSON.stringify(answeredEvent.response)).not.toContain(SECRET);

    // The value is nowhere a person or the agent could read it: not the page, not the thread's
    // history, not the API.
    expect(await page.content()).not.toContain(SECRET);
    const variables = await page.request.get(`/api/projects/${projectId}/variables`);
    expect(await variables.json()).toEqual([
      expect.objectContaining({ name: "STRIPE_API_KEY", secret: true, value: null }),
    ]);
    expect(await variables.text()).not.toContain(SECRET);
    const personal = await page.request.get("/api/variables/personal");
    expect(await personal.json()).toEqual([]);
  });

  test("can be kept for the person alone", async ({ page }) => {
    const { projectId } = await startRequest(page);
    const form = page.getByRole("form", { name: "Provide a secret" });
    await form.getByLabel("What is the Stripe test key?").fill(SECRET);
    await form.getByRole("radio", { name: "Only me" }).click();
    await form.getByRole("button", { name: "Store and continue" }).click();
    await expect(page.getByText("Thanks, on it.")).toBeVisible();

    const personal = (await (await page.request.get("/api/variables/personal")).json()) as {
      name: string;
    }[];
    expect(personal.map((variable) => variable.name)).toEqual(["STRIPE_API_KEY"]);
    const project = await page.request.get(`/api/projects/${projectId}/variables`);
    expect(await project.json()).toEqual([]);
  });

  test("can be declined: nothing is stored and the run goes on", async ({ page }) => {
    const { events, projectId } = await startRequest(page);
    const form = page.getByRole("form", { name: "Provide a secret" });
    await form.getByRole("button", { name: "Decline" }).click();

    await expect(page.getByText("Thanks, on it.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Answered questions" })).toContainText(
      "not provided",
    );
    await expect(async () => {
      expect(events.find((entry) => entry.type === "answered")).toMatchObject({
        response: { answers: [{ questionId: "STRIPE_API_KEY", value: "not provided" }] },
      });
    }).toPass({ timeout: 5000 });
    const project = await page.request.get(`/api/projects/${projectId}/variables`);
    expect(await project.json()).toEqual([]);
  });
});
