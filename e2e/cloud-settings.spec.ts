import { expect, test } from "@playwright/test";

import { registerPlatformOwner, registerUser } from "./helpers";

const saved = {
  provider: "spaces",
  base: "https://spaces.example.com/api/v1",
  runnerUrl: "http://192.168.1.10:8000",
  keyHint: "1234",
};

test.describe("the platform's sandbox page", () => {
  test("starts the other platform empty, so one platform's address is never saved as the other's", async ({
    page,
  }) => {
    await page.route("**/api/platform/cloud", (route) => {
      const request = route.request();

      if (request.method() === "GET") return route.fulfill({ json: saved });

      if (request.method() === "PUT") {
        return route.fulfill({ json: { ...request.postDataJSON(), keyHint: "abcd" } });
      }

      return route.fulfill({ json: { removed: true } });
    });

    await registerPlatformOwner(page, 2);
    await page.goto("/settings/sandbox");

    await expect(page.getByText("Sandbox platform: Spaces")).toBeVisible();
    await expect(page.getByLabel("Spaces server")).toHaveValue(saved.base);

    await page.getByRole("combobox", { name: "Sandbox platform" }).click();
    await page.getByRole("option", { name: "lizard.build", exact: true }).click();
    await expect(page.getByLabel("Lizard API address (optional)")).toHaveValue("");
    await expect(page.getByLabel("Lizard project (optional if account has one)")).toHaveValue("");

    await page.getByRole("combobox", { name: "Sandbox platform" }).click();
    await page.getByRole("option", { name: "Sprites", exact: true }).click();

    await expect(page.getByLabel("Sprites API address (optional)")).toHaveValue("");

    await page.getByLabel("API key").fill("anvia/org-id/token-id/secret");

    const sprites = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().endsWith("/api/platform/cloud"),
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();

    expect((await sprites).postDataJSON()).toMatchObject({
      provider: "sprites",
      base: "",
      project: "",
      runnerUrl: "",
      apiKey: "anvia/org-id/token-id/secret",
    });

    await page.getByRole("combobox", { name: "Sandbox platform" }).click();
    await page.getByRole("option", { name: "boat.dev", exact: true }).click();

    await expect(page.getByLabel("Boat API address (optional)")).toHaveValue("");
    await expect(page.getByLabel("Public address a sandbox dials")).toHaveValue("");
    await expect(page.getByLabel("API key")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

    await page.getByLabel("API key").fill("boat_abcd");

    const put = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().endsWith("/api/platform/cloud"),
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();

    expect((await put).postDataJSON()).toMatchObject({
      provider: "boat",
      base: "",
      project: "",
      runnerUrl: "",
      apiKey: "boat_abcd",
    });
  });

  test("the computers' idle windows, lifetime and limits are saved, kept and reset", async ({
    page,
  }) => {
    await registerPlatformOwner(page, 1);
    await page.goto("/settings/sandbox");

    const section = page.getByRole("region", { name: "Aven Cloud computers" });
    await expect(section.getByLabel("Delete a stopped computer after this many hours")).toHaveValue(
      "48",
    );
    await expect(
      section.getByLabel("Hard wall: maximum continuous running time (hours)"),
    ).toHaveValue("12");
    await expect(
      section.getByLabel("Most computers a workspace may have running at once"),
    ).toHaveValue("");

    await section.getByLabel("Delete a stopped computer after this many hours").fill("72");
    await section.getByLabel("Hard wall: maximum continuous running time (hours)").fill("24");
    await section.getByLabel("Most computers a workspace may have running at once").fill("6");
    await section.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Computer settings saved")).toBeVisible();

    await page.reload();
    await expect(section.getByLabel("Delete a stopped computer after this many hours")).toHaveValue(
      "72",
    );
    await expect(
      section.getByLabel("Hard wall: maximum continuous running time (hours)"),
    ).toHaveValue("24");
    await expect(
      section.getByLabel("Most computers a workspace may have running at once"),
    ).toHaveValue("6");

    await section.getByRole("button", { name: "Reset to defaults" }).click();
    await expect(section.getByLabel("Delete a stopped computer after this many hours")).toHaveValue(
      "48",
    );
    await expect(
      section.getByLabel("Hard wall: maximum continuous running time (hours)"),
    ).toHaveValue("12");
    await expect(
      section.getByLabel("Most computers a workspace may have running at once"),
    ).toHaveValue("");
  });

  test("is not there for someone who is not an owner of this installation", async ({ browser }) => {
    const other = await browser.newContext();
    const outsider = await other.newPage();
    await registerUser(outsider, "sandbox-outsider", "Sandbox Outsider");

    expect((await outsider.request.get("/api/platform/cloud")).status()).toBe(403);
    expect((await outsider.request.get("/api/platform/cloud/lifecycle")).status()).toBe(403);
    await outsider.goto("/settings/sandbox");
    await expect(outsider).toHaveURL(/\/settings\/general$/);
    await other.close();
  });
});
