import { describe, expect, test } from "bun:test";

import { mentionNote } from "./mentions";
import type { SandboxPaths } from "./types";
import type { MessageMention } from "@aven/protocol/types";

const paths: SandboxPaths = { workspace: "/work", uploads: "/uploads", skills: "/skills" };

const file = (name: string, from = 0): MessageMention => ({
  type: "file",
  name,
  from,
  to: from + name.length + 1,
});

describe("mentionNote", () => {
  test("says nothing when nothing was pointed at", () => {
    expect(mentionNote([], [])).toBeUndefined();
  });

  test("lists the files the user pointed at under the workspace", () => {
    const note = mentionNote([file("src/a.ts")], [], paths);
    expect(note).toContain("this file");
    expect(note).toContain("- /work/src/a.ts");
  });

  test("tells a folder from a file by its trailing slash", () => {
    const note = mentionNote([file("src/a.ts"), file("docs/", 10)], [], paths);
    expect(note).toContain("this file");
    expect(note).toContain("- /work/src/a.ts");
    expect(note).toContain("this folder");
    expect(note).toContain("- /work/docs/");
  });
});
