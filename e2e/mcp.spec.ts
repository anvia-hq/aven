import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("MCP servers", () => {
  test("a server is added with a secret header, edited, switched off and removed", async ({
    page,
  }) => {
    await registerUser(page, "mcp", "Mcp Person");
    await page.goto("/settings/mcp");
    await expect(page.getByText("No MCP servers yet.")).toBeVisible();

    await page.getByRole("button", { name: "Add server" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Team notes");
    await page.getByLabel("URL").fill("https://mcp.example.com/mcp");
    await page.getByRole("button", { name: "Add header" }).click();
    await page.getByLabel("Header name").fill("Authorization");
    await page.getByLabel("Value of Authorization").fill("Bearer s3cret-token");
    await page.getByRole("button", { name: "Add server", exact: true }).click();
    await expect(page.getByText("MCP server added")).toBeVisible();

    const row = page.getByRole("list", { name: "MCP servers" }).getByRole("listitem");
    await expect(row).toContainText("Team notes");
    await expect(row).toContainText("https://mcp.example.com/mcp");
    await expect(row).toContainText("Headers: Authorization");
    await expect(row).toContainText("Bots and threads");
    await expect(page.getByText("s3cret-token")).toHaveCount(0);
    const listed = await (await page.request.get("/api/mcp-servers")).text();
    expect(listed).not.toContain("s3cret-token");

    await page.getByRole("button", { name: "Edit Team notes" }).click();
    await page.getByRole("combobox", { name: "Used by" }).click();
    await page.getByRole("option", { name: "Threads only" }).click();
    await expect(page.getByLabel("Value of Authorization")).toHaveAttribute(
      "placeholder",
      "Saved: leave blank to keep",
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("MCP server saved")).toBeVisible();
    await expect(row).toContainText("Threads only");
    await expect(row).toContainText("Headers: Authorization");

    await page.getByRole("switch", { name: "Use Team notes" }).click();
    await expect(page.getByRole("switch", { name: "Use Team notes" })).not.toBeChecked();

    await page.getByRole("button", { name: "Remove Team notes" }).click();
    await expect(page.getByText("MCP server removed")).toBeVisible();
    await expect(page.getByText("No MCP servers yet.")).toBeVisible();
  });

  test("a name that reads like another is refused", async ({ page }) => {
    await registerUser(page, "mcp", "Mcp Person");
    await page.goto("/settings/mcp");
    const add = async (name: string) => {
      await page.getByRole("button", { name: "Add server" }).click();
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByLabel("URL").fill("https://mcp.example.com/mcp");
      await page.getByRole("button", { name: "Add server", exact: true }).click();
    };
    await add("Docs Site");
    await expect(page.getByText("MCP server added")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add server" })).toHaveCount(1);
    await add("docs-site");
    await expect(page.getByText("You already have an MCP server with that name")).toBeVisible();
  });
});
