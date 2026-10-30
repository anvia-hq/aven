import { describe, expect, test } from "bun:test";

import { highlight, languageOf } from "./highlight";

describe("languageOf", () => {
  test("knows a file by its extension or its name", () => {
    expect(languageOf("src/app.tsx")).toBe("tsx");
    expect(languageOf(".oxfmtrc.json")).toBe("json");
    expect(languageOf("docs/README.MD")).toBe("md");
    expect(languageOf("apps/runtime/sandbox-image/Dockerfile")).toBe("docker");
    expect(languageOf("Makefile")).toBe("make");
  });

  test("has none for what it does not know", () => {
    expect(languageOf("LICENSE")).toBeNull();
    expect(languageOf("notes.unheard-of")).toBeNull();
  });
});

describe("highlight", () => {
  test("gives each line its tokens, coloured for both themes", async () => {
    const lines = await highlight('const a = "x";\nlet b = 1;\n', "a.ts");
    expect(lines?.length).toBeGreaterThanOrEqual(2);
    expect(lines![0]!.map((token) => token.content).join("")).toBe('const a = "x";');
    const style = lines![0]![0]!.htmlStyle as Record<string, string>;
    expect(Object.keys(style)).toEqual(expect.arrayContaining(["--shiki-light", "--shiki-dark"]));
  });

  test("leaves a file it cannot colour alone", async () => {
    expect(await highlight("plain", "LICENSE")).toBeNull();
    expect(await highlight("x".repeat(200_001), "big.ts")).toBeNull();
  });
});
