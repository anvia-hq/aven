import { describe, expect, test } from "bun:test";

import { repositoryAddress } from "./repository-address";

describe("repositoryAddress", () => {
  test("takes owner/name as a GitHub repository", () => {
    expect(repositoryAddress(" anvia-hq/aven ")).toEqual({
      url: "https://github.com/anvia-hq/aven.git",
      host: "github.com",
      owner: "anvia-hq",
      name: "aven",
    });
  });

  test("takes an https address with or without .git or a trailing slash", () => {
    for (const given of [
      "https://github.com/anvia-hq/aven",
      "https://github.com/anvia-hq/aven.git",
      "https://github.com/anvia-hq/aven/",
    ]) {
      expect(repositoryAddress(given)).toMatchObject({
        url: "https://github.com/anvia-hq/aven.git",
        owner: "anvia-hq",
        name: "aven",
      });
    }
  });

  test("takes an ssh address", () => {
    expect(repositoryAddress("git@gitlab.com:team/app.git")).toMatchObject({
      host: "gitlab.com",
      owner: "team",
      name: "app",
    });
  });

  test("refuses paths, other schemes, credentials, options and dot segments", () => {
    for (const given of [
      "/Users/me/code/app",
      "../app",
      "file:///tmp/app",
      "http://github.com/a/b",
      "https://user:pass@github.com/a/b",
      "--upload-pack=touch x/y",
      "a/..",
      "../b",
      "https://github.com/a/b/c",
      "",
    ]) {
      expect(() => repositoryAddress(given)).toThrow("Give the repository as");
    }
  });
});
