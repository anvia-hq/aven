import { describe, expect, test } from "bun:test";

import { parseActions } from "./parse";

describe("the actions file", () => {
  test("lists commands and prompts in the order written", () => {
    expect(
      parseActions(
        [
          "actions:",
          "  - name: Test",
          "    run: bun test",
          "  - name: Fix lint",
          "    prompt: Fix what the linter reports",
        ].join("\n"),
      ),
    ).toEqual({
      actions: [
        { name: "Test", kind: "run", body: "bun test" },
        { name: "Fix lint", kind: "prompt", body: "Fix what the linter reports" },
      ],
      problem: null,
    });
  });

  test("says what is wrong and offers nothing", () => {
    const problem = (text: string) => parseActions(text).problem;
    expect(problem("actions: [")).toBeString();
    expect(problem("tasks: []")).toContain("actions");
    expect(problem("actions:\n  - name: A")).toContain("either run or prompt");
    expect(problem("actions:\n  - name: A\n    run: x\n    prompt: y")).toContain("either");
    expect(problem("actions:\n  - name: A\n    run: x\n    shell: y")).toBeString();
    expect(problem("actions:\n  - name: A\n    run: x\n  - name: A\n    run: y")).toContain(
      "twice",
    );
    const many = Array.from({ length: 13 }, (_, i) => `  - name: n${i}\n    run: x`).join("\n");
    expect(parseActions(`actions:\n${many}`).actions).toEqual([]);
  });
});
