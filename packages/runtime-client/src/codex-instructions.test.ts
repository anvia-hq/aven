import { describe, expect, test } from "bun:test";

import { codexInstructions } from "./codex-instructions";

describe("Codex instructions", () => {
  test("names the aven tools and the skills, variables and MCP servers the run can see", () => {
    const text = codexInstructions({
      skills: [{ name: "review", description: "Review a change", path: "/skills/review" }],
      envNames: ["API_URL"],
      mcp: { servers: [{ name: "linear", tools: 1 }], failed: [] },
      questions: true,
    });

    expect(text).toContain("aven");
    expect(text).toContain("review");
    expect(text).toContain("API_URL");
    expect(text).toContain("linear");
  });
});
