import { expect, test } from "@playwright/test";

import { registerUser, revealToast } from "./helpers";

test.describe("providers", () => {
  test("a provider's models can be fetched again, and a failure says why", async ({ page }) => {
    await registerUser(page, "prv", "Provider User");
    await page.request.post("/api/providers", {
      data: { kind: "openai", name: "Work", apiKey: "sk-test-1234" },
    });

    const lists = [["gpt-4o"], ["gpt-4o"], ["gpt-4o", "o3"], ["gpt-4o", "o3", "gpt-5"], null];
    let asked = 0;
    await page.route("**/api/providers/*/models", (route) => {
      const list = lists[asked++];
      return list
        ? route.fulfill({ json: { models: list, efforts: {} } })
        : route.fulfill({ status: 502, json: { message: "The provider did not answer" } });
    });

    await page.goto("/settings/providers");
    const work = page.getByRole("listitem", { name: "Work" });
    await work.getByRole("button", { name: "Edit" }).click();
    await expect(work.getByRole("combobox", { name: "Model" })).toContainText("gpt-4o");
    const refetch = work.getByRole("button", { name: "Refetch models" });

    await refetch.click();
    await revealToast(page, "Work: 2 models");
    await expect(page.getByText("Work: 2 models")).toBeVisible();

    await refetch.click();
    await revealToast(page, "Work: 3 models");
    await expect(page.getByText("Work: 3 models")).toBeVisible();

    await refetch.click();
    await expect(page.getByText("Could not list the models of Work")).toBeVisible();
    await expect(refetch).toBeEnabled();
    expect(asked).toBe(5);
  });
});

test("the model of a provider is picked from a list that loads by itself", async ({ page }) => {
  await registerUser(page, "prm", "Model User");
  await page.route("**/api/providers/models", (route) =>
    route.fulfill({ json: { models: ["claude-haiku-5-5", "claude-sonnet-5"] } }),
  );
  await page.goto("/settings/providers");
  const anthropic = page.getByRole("listitem", { name: "Anthropic" });
  await anthropic.getByRole("button", { name: "Set up" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(anthropic.getByRole("button", { name: "Load models" })).toHaveCount(0);
  await anthropic.getByLabel("API key").fill("sk-ant-test-1234");
  await expect(anthropic.getByRole("combobox", { name: "Model" })).toContainText(
    "claude-haiku-5-5",
  );
});

test("a connected provider and custom OpenAI-compatible server can rotate their API keys inline", async ({
  page,
}) => {
  await registerUser(page, "prk", "Key Rotate User");
  await page.route("**/api/providers/models", (route) =>
    route.fulfill({ json: { models: ["vllm-70b", "vllm-8b"] } }),
  );
  await page.route("**/api/providers/*/models", (route) =>
    route.fulfill({ json: { models: ["vllm-70b", "vllm-8b"], efforts: {} } }),
  );
  await page.goto("/settings/providers");

  const custom = page.getByRole("listitem", { name: "OpenAI-compatible" });
  await expect(custom.locator("svg").first()).toBeVisible();
  await custom.getByRole("button", { name: "Set up" }).click();
  await custom.getByLabel("Name").fill("Local vLLM");
  await custom.getByLabel("Base URL").fill("http://localhost:8080/v1");
  await custom.getByLabel("API key (optional)").fill("sk-old-1111");
  await expect(custom.getByRole("combobox", { name: "Model" })).toContainText("vllm-70b");
  await custom.getByRole("button", { name: "Add provider" }).click();

  const connected = page.getByRole("listitem", { name: "Local vLLM" });
  await expect(connected).toContainText("Configured");
  await expect(connected).toContainText("vllm-70b");
  await expect(connected).not.toContainText("http://localhost:8080/v1");
  await expect(connected).not.toContainText("…1111");

  await connected.getByRole("button", { name: "Edit" }).click();
  await connected.getByLabel("API key (optional)").fill("sk-new-9999");
  await connected.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(async () => {
      const list = (await (await page.request.get("/api/providers")).json()) as {
        name: string;
        keyHint?: string | null;
      }[];
      return list.find((item) => item.name === "Local vLLM")?.keyHint;
    })
    .toBe("9999");
});
