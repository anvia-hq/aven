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
