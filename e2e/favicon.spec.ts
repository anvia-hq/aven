import { expect, test } from "@playwright/test";

test("the page has the logo as its favicon, served from the root", async ({ page, request }) => {
  await page.goto("/sign-in");
  const icons = await page
    .locator('head link[rel~="icon"], head link[rel="apple-touch-icon"]')
    .evaluateAll((links) =>
      links.map((link) => [link.getAttribute("rel"), link.getAttribute("href")] as const),
    );
  expect(icons).toEqual([
    ["icon", "/favicon.svg"],
    ["icon", "/favicon-32.png"],
    ["apple-touch-icon", "/apple-touch-icon.png"],
  ]);

  // Each is a file of its kind, not the app's index page that a missing file would fall back to.
  const kinds = {
    "/favicon.svg": "image/svg+xml",
    "/favicon-32.png": "image/png",
    "/apple-touch-icon.png": "image/png",
  };
  for (const [path, type] of Object.entries(kinds)) {
    const response = await request.get(path);
    expect(response.ok(), path).toBe(true);
    expect(response.headers()["content-type"], path).toContain(type);
  }
});
