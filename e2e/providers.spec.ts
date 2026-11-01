import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("providers", () => {
  test("a provider's models can be fetched again, and a failure says why", async ({ page }) => {
    await registerUser(page, "prv", "Provider User");
    await page.request.post("/api/providers", {
      data: { kind: "openai", name: "Work", apiKey: "sk-test-1234" },
    });

    // What the provider lists changes between asks, as when a gateway adds a model. The real list
    // would ask OpenAI, which e2e must never do.
    const lists = [["gpt-4o", "o3"], ["gpt-4o", "o3", "gpt-5"], null];
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
    // Failing leaves the button usable, to try again once the key or the server is right.
    await expect(refetch).toBeEnabled();
    expect(asked).toBe(3);
  });
});
