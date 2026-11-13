import { describe, expect, test } from "bun:test";

import { artifactGroups, findArtifact, kindOf } from "./artifacts";
import type { BotChatMessage } from "./types";

const file = (name: string, title?: string) => ({
  name: `${name}.pdf`,
  mediaType: "application/pdf",
  title,
});
const said = (id: string, ...artifacts: ReturnType<typeof file>[]): BotChatMessage => ({
  id,
  role: "bot",
  text: "x",
  artifacts,
});

describe("artifactGroups", () => {
  test("a file sent again under its title is a new version of it, newest first", () => {
    const groups = artifactGroups([
      said("b-0", file("one", "Report")),
      { id: "m-1", role: "user", text: "again" },
      said("b-1", file("two", "Report"), file("other", "Notes")),
    ]);
    expect(groups.map((group) => [group.title, group.versions.map((v) => v.name)])).toEqual([
      ["Report", ["two.pdf", "one.pdf"]],
      ["Notes", ["other.pdf"]],
    ]);
  });

  test("finds a version by its name and counts it from the first", () => {
    const groups = artifactGroups([
      said("b-0", file("one", "Report")),
      said("b-1", file("two", "Report")),
    ]);
    expect(findArtifact(groups, "one.pdf")?.number).toBe(1);
    expect(findArtifact(groups, "two.pdf")?.number).toBe(2);
    expect(findArtifact(groups, "nope.pdf")).toBeUndefined();
    expect(findArtifact(groups, undefined)).toBeUndefined();
  });

  test("tells what to draw from the media type", () => {
    expect(kindOf("application/pdf")).toBe("pdf");
    expect(kindOf("text/markdown")).toBe("markdown");
    expect(kindOf("image/png")).toBe("image");
    expect(kindOf("video/mp4")).toBe("video");
    expect(kindOf("text/html")).toBe("page");
  });
});
