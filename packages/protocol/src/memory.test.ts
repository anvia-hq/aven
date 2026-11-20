import { describe, expect, test } from "bun:test";

import { MEMORY_DESCRIPTION_MAX, noteDescription } from "./memory";

describe("noteDescription", () => {
  test("reads description from YAML frontmatter and strips matching quotes", () => {
    expect(
      noteDescription('---\ntitle: Notes\ndescription: "User preferences"\n---\n# Heading'),
    ).toBe("User preferences");
    expect(noteDescription("---\r\ndescription: 'Deploy checklist'\r\n---\r\nBody")).toBe(
      "Deploy checklist",
    );
    expect(noteDescription("---\ndescription: Plain   spaced   summary\n---\nBody")).toBe(
      "Plain spaced summary",
    );
  });

  test("falls back to the first non-empty body line when frontmatter has no description", () => {
    expect(noteDescription("---\ntype: reference\n---\n\n## Release Notes\nDetails")).toBe(
      "Release Notes",
    );
    expect(noteDescription("\n\n#   Project Architecture\nMore text")).toBe("Project Architecture");
    expect(noteDescription("Just a first line\nSecond line")).toBe("Just a first line");
  });

  test("returns an empty string for blank notes or empty frontmatter bodies", () => {
    expect(noteDescription("")).toBe("");
    expect(noteDescription("   \n\t\n")).toBe("");
    expect(noteDescription("---\ntype: user\n---\n\n")).toBe("");
  });

  test("truncates descriptions longer than MEMORY_DESCRIPTION_MAX with an ellipsis", () => {
    const long = "a".repeat(MEMORY_DESCRIPTION_MAX + 50);
    const result = noteDescription(long);
    expect(result).toHaveLength(MEMORY_DESCRIPTION_MAX);
    expect(result.endsWith("…")).toBe(true);
    expect(noteDescription("b".repeat(MEMORY_DESCRIPTION_MAX))).toBe(
      "b".repeat(MEMORY_DESCRIPTION_MAX),
    );
  });
});
