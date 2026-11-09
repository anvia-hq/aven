import { expect, test } from "@playwright/test";

import { HTML_HEADERS, framedHtml } from "../apps/control-plane/src/modules/artifacts/html-frame";
import { addRunner, connectGithub, importRepository, registerUser } from "./helpers";

const NAME = "00000000-0000-4000-8000-000000000005.html";

const PAGE = `<!doctype html><html><head><style>
  body { margin: 0; height: 300px; color: var(--aven-foreground, red); }
</style></head><body><p id="hello">Hello from the page</p><p id="network">checking</p><script>
  fetch("/api/threads").then(
    () => { document.getElementById("network").textContent = "network open"; },
    () => { document.getElementById("network").textContent = "network blocked"; },
  );
  document.getElementById("hello").dataset.cookie = String(document.cookie === "");
</script></body></html>`;

test.describe("an interactive page the agent showed (decision 0181)", () => {
  test("runs in a sandboxed frame that fits its content, takes the app's colors and cannot reach the network", async ({
    page,
  }) => {
    const events = [
      {
        type: "snapshot",
        running: false,
        messages: [
          { id: "m-0", role: "user", parts: [{ type: "text", text: "Show a page" }] },
          {
            id: "m-1",
            role: "assistant",
            parts: [
              {
                type: "tool",
                tool: {
                  id: "c1",
                  name: "show_artifact",
                  target: "page.html",
                  status: "done",
                  output: "Showed 1",
                  artifacts: [{ name: NAME, mediaType: "text/html", caption: "A live page" }],
                },
              },
            ],
          },
        ],
      },
      { type: "done" },
    ];
    await page.route("**/api/threads/*/events", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 600000\n\n${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}`,
      }),
    );
    await page.route("**/api/threads/*/artifacts/*", (route) =>
      route.fulfill({ status: 200, headers: HTML_HEADERS, body: framedHtml(PAGE) }),
    );

    await registerUser(page, "apage", "Page User");
    await addRunner(page);
    await connectGithub(page);
    await page.goto("/threads");
    await importRepository(page, "project");
    await page.getByRole("textbox", { name: "Prompt" }).fill("Show a page");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);

    const iframe = page.locator('iframe[title="A live page"]');
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    const frame = page.frameLocator('iframe[title="A live page"]');
    await expect(frame.locator("#hello")).toHaveText("Hello from the page");
    await expect(frame.locator("#network")).toHaveText("network blocked");
    await expect.poll(async () => (await iframe.boundingBox())?.height).toBeGreaterThanOrEqual(300);
    await expect.poll(async () => (await iframe.boundingBox())?.height).toBeLessThan(340);
    const color = await frame
      .locator("#hello")
      .evaluate((element) => getComputedStyle(element).color);
    expect(color).not.toBe("rgb(255, 0, 0)");

    await page.getByRole("button", { name: "Expand A live page" }).click();
    await expect(page.getByRole("dialog").locator("iframe")).toBeVisible();
  });
});
