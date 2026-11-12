import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

const rpc = (method: string, params?: unknown) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  params,
});

test("an access token lets another tool use Aven over MCP, only as far as its permissions go", async ({
  page,
  request,
}) => {
  await registerUser(page, "mcpaccess", "Access User");
  await page.goto("/settings/mcp-access");
  await expect(page.getByText("No access tokens yet")).toBeVisible();

  await page.getByRole("button", { name: "New token" }).click();
  await page.getByLabel("Name").fill("Grokbot");
  await expect(page.getByRole("checkbox", { name: "Read" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Change" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Destructive" })).not.toBeChecked();
  await page.getByRole("button", { name: "Create token" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Grokbot is ready")).toBeVisible();
  const shown = await dialog.getByText(/claude mcp add/).textContent();
  const token = /Bearer (avn_[\w-]+)/.exec(shown ?? "")?.[1];
  expect(token).toBeTruthy();
  await dialog.getByRole("button", { name: "Done" }).click();

  const row = page.getByRole("list", { name: "Access tokens" }).getByRole("listitem");
  await expect(row).toContainText("Grokbot");
  await expect(row).toContainText("Read");
  await expect(row).toContainText("Change");
  await expect(row).toContainText("Never used");

  const headers = { authorization: `Bearer ${token}` };
  const refused = await request.post("/api/mcp", { data: rpc("tools/list") });
  expect(refused.status()).toBe(401);

  const tools = await request.post("/api/mcp", { headers, data: rpc("tools/list") });
  const names = (await tools.json()).result.tools.map((tool: { name: string }) => tool.name);
  expect(names).toEqual([
    "aven_workspaces",
    "aven_list_projects",
    "aven_start_task",
    "aven_get_thread",
    "aven_stop_thread",
    "aven_search_api",
    "aven_call_api",
  ]);

  const guide = await request.post("/api/mcp", {
    headers,
    data: rpc("resources/read", { uri: "aven://guide" }),
  });
  expect((await guide.json()).result.contents[0].text).toContain("Using Aven from another harness");

  const call = (name: string, args: unknown) =>
    request.post("/api/mcp", { headers, data: rpc("tools/call", { name, arguments: args }) });

  const projects = await (await call("aven_call_api", { method: "GET", path: "/projects" })).json();
  expect(projects.result.isError).toBeUndefined();
  expect(JSON.parse(projects.result.content[0].text)).toMatchObject({ status: 200, body: [] });

  const listed = await (await call("aven_list_projects", {})).json();
  expect(JSON.parse(listed.result.content[0].text)).toMatchObject({ status: 200, body: [] });

  const missing = await (
    await call("aven_get_thread", { threadId: "3b0f6d2e-4c1a-4f7e-9a53-0d2f6a9b1c11" })
  ).json();
  expect(missing.result.isError).toBe(true);
  expect(JSON.parse(missing.result.content[0].text).status).toBe(404);

  const removal = await (
    await call("aven_call_api", { method: "DELETE", path: "/threads/abc" })
  ).json();
  expect(removal.result).toMatchObject({
    isError: true,
    content: [{ text: "This token does not have the destructive permission" }],
  });

  const hidden = await (await call("aven_call_api", { method: "GET", path: "/mcp-access" })).json();
  expect(hidden.result.isError).toBe(true);

  await page.reload();
  await expect(row).toContainText("Used");

  await page.getByRole("button", { name: "Remove Grokbot" }).click();
  await expect(page.getByText("No access tokens yet")).toBeVisible();
  const afterRemoval = await request.post("/api/mcp", { headers, data: rpc("tools/list") });
  expect(afterRemoval.status()).toBe(401);
});
