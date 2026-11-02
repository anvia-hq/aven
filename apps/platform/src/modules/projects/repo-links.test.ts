import { describe, expect, test } from "bun:test";

import { blobUrl, resolveRepoUrl } from "./repo-links";

describe("blobUrl", () => {
  test("is the file's page on the default branch, each segment encoded", () => {
    expect(blobUrl("acme/web", "main", "src/my file.ts")).toBe(
      "https://github.com/acme/web/blob/main/src/my%20file.ts",
    );
  });
});

describe("resolveRepoUrl", () => {
  const link = (href: string) => resolveRepoUrl(href, "acme/web", "main", "link");
  const image = (href: string) => resolveRepoUrl(href, "acme/web", "main", "image");

  test("leaves what points elsewhere as it is", () => {
    for (const href of [
      "https://example.com/a",
      "mailto:a@b.c",
      "//cdn.example.com/x.png",
      "#install",
    ]) {
      expect(link(href)).toBe(href);
      expect(image(href)).toBe(href);
    }
  });

  test("a relative link points at the file on GitHub, from the top for a leading slash", () => {
    expect(link("docs/guide.md")).toBe("https://github.com/acme/web/blob/main/docs/guide.md");
    expect(link("./docs/guide.md#top")).toBe(
      "https://github.com/acme/web/blob/main/docs/guide.md#top",
    );
    expect(link("/LICENSE")).toBe("https://github.com/acme/web/blob/main/LICENSE");
  });

  test("a relative image points at the raw file", () => {
    expect(image("docs/logo.png")).toBe(
      "https://raw.githubusercontent.com/acme/web/main/docs/logo.png",
    );
  });
});
