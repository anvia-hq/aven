import { describe, expect, test } from "bun:test";

import { createOpenBrowserTool, openBrowserSchema } from "./open-browser";

describe("open_browser", () => {
  test("offers the address and says the person decides, without opening anything", async () => {
    const tool = createOpenBrowserTool();
    const result = await tool.call({ port: 3000 });

    expect(tool.name).toBe("open_browser");
    expect(result).toContain("http://localhost:3000");
    expect(result).toContain("do not assume it is open");
  });

  test("takes a port and nothing else", () => {
    expect(openBrowserSchema.safeParse({ port: 5173 }).success).toBe(true);

    for (const port of [0, 65536, 3000.5, "3000"]) {
      expect(openBrowserSchema.safeParse({ port }).success).toBe(false);
    }
  });
});
