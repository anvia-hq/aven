import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("providers", () => {
  test("a provider's models can be fetched again, and a failure says why", async ({ page }) => {
    await registerUser(page, "prv", "Provider User");
    await page.request.post("/api/providers", {
      data: { kind: "openai", name: "Work", apiKey: "sk-test-1234" },
    });

    const lists = [["gpt-4o"], ["gpt-4o", "o3"], ["gpt-4o", "o3", "gpt-5"], null];
    let asked = 0;
    await page.route("**/api/providers/*/models", (route) => {
      const list = lists[asked++];
      return list
        ? route.fulfill({ json: { models: list, efforts: {} } })
        : route.fulfill({ status: 502, json: { message: "The provider did not answer" } });
    });

    await page.goto("/settings/providers");
    const refetch = page.getByRole("button", { name: "Refetch models" });

    await refetch.click();
    await expect(page.getByText("Work: 2 models")).toBeVisible();

    await refetch.click();
    await expect(page.getByText("Work: 3 models")).toBeVisible();

    await refetch.click();
    await expect(page.getByText("Could not list the models of Work")).toBeVisible();
    await expect(refetch).toBeEnabled();
    expect(asked).toBe(4);
  });
});

test("the model of a provider is picked from a list that loads by itself", async ({ page }) => {
  await registerUser(page, "prm", "Model User");
  await page.route("**/api/providers/models", (route) =>
    route.fulfill({ json: { models: ["claude-haiku-5-5", "claude-sonnet-5"] } }),
  );
  await page.goto("/settings/providers");
  await page.getByRole("button", { name: "Set up" }).nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Load models" })).toHaveCount(0);
  await dialog.getByLabel("API key").fill("sk-ant-test-1234");
  await expect(dialog.getByRole("combobox", { name: "Model" })).toContainText("claude-haiku-5-5");
  await page.screenshot({ path: ".aven/proof/provider-models/after.png" });
});

test.describe("Codex", () => {
  async function ownRunner(page: import("@playwright/test").Page, codex: boolean) {
    const made = await page.request.post("/api/runtimes", { data: { name: "my-laptop" } });
    expect(made.ok()).toBe(true);
    await page.route("**/api/runtimes", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const response = await route.fetch();
      const runtimes = (await response.json()) as { name: string }[];
      return route.fulfill({
        response,
        json: runtimes.map((runtime) =>
          runtime.name === "my-laptop" ? { ...runtime, online: true, codex } : runtime,
        ),
      });
    });
  }

  test("with no runner of your own that has Codex, the dialog says what to do", async ({
    page,
  }) => {
    await registerUser(page, "cdx", "Codex User");
    await ownRunner(page, false);
    await page.goto("/settings/providers");
    await page.getByRole("listitem", { name: "Codex" }).getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: "Connect your ChatGPT subscription" });
    await expect(dialog.getByText("You need a runner of your own")).toBeVisible();
    await expect(dialog.getByText("Not ready: my-laptop")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Connect ChatGPT" })).toHaveCount(0);
  });

  test("the person is walked through the device code, and Codex is added once it is approved", async ({
    page,
  }) => {
    await registerUser(page, "cdy", "Codex Walker");
    await ownRunner(page, true);
    let state: Record<string, unknown> = { state: "signed-out" };
    const actions: string[] = [];
    await page.route("**/api/runtimes/*/codex", (route) => route.fulfill({ json: state }));
    await page.route("**/api/runtimes/*/codex/login", async (route) => {
      const { action } = route.request().postDataJSON() as { action: string };
      actions.push(action);
      state =
        action === "start"
          ? { state: "waiting", url: "https://auth.openai.com/codex/device", code: "AOL5-C2T9O" }
          : { state: "signed-out" };
      await route.fulfill({ json: state });
    });

    await page.goto("/settings/providers");
    await page.getByRole("listitem", { name: "Codex" }).getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: "Connect your ChatGPT subscription" });
    await dialog.getByRole("button", { name: "Connect ChatGPT" }).click();

    await expect(dialog.getByText("Enable device code authorization for Codex.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: /Open Device Authorization/ })).toHaveAttribute(
      "href",
      "https://auth.openai.com/codex/device",
    );
    await expect(dialog.getByLabel("Device code")).toHaveText("AOL5-C2T9O");
    await expect(dialog.getByText("Waiting for approval. Keep this dialog open.")).toBeVisible();

    state = { state: "signed-in" };
    await dialog.getByRole("button", { name: "Add Codex" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("listitem", { name: "Codex" })).toBeVisible();
    const listed = (await (await page.request.get("/api/providers")).json()) as {
      kind: string;
      hasKey: boolean;
    }[];
    expect(listed).toMatchObject([{ kind: "codex", hasKey: false }]);
    expect(actions).toEqual(["start"]);
  });

  test("closing the dialog while it waits cancels the sign-in on the runner", async ({ page }) => {
    await registerUser(page, "cdz", "Codex Closer");
    await ownRunner(page, true);
    let state: Record<string, unknown> = { state: "signed-out" };
    const actions: string[] = [];
    await page.route("**/api/runtimes/*/codex", (route) => route.fulfill({ json: state }));
    await page.route("**/api/runtimes/*/codex/login", async (route) => {
      const { action } = route.request().postDataJSON() as { action: string };
      actions.push(action);
      state =
        action === "start"
          ? { state: "waiting", url: "https://auth.openai.com/codex/device", code: "AOL5-C2T9O" }
          : { state: "signed-out" };
      await route.fulfill({ json: state });
    });
    await page.goto("/settings/providers");
    await page.getByRole("listitem", { name: "Codex" }).getByRole("button").click();
    const dialog = page.getByRole("dialog", { name: "Connect your ChatGPT subscription" });
    await dialog.getByRole("button", { name: "Connect ChatGPT" }).click();
    await expect(dialog.getByLabel("Device code")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => actions).toEqual(["start", "cancel"]);
  });
});
