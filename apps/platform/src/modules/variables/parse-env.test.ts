import { describe, expect, test } from "bun:test";

import { looksLikeEnv, parseEnv } from "./parse-env";

describe("parseEnv", () => {
  test("reads names and values, skipping comments and blank lines", () => {
    const { entries, issues } = parseEnv("# db\nDATABASE_URL=postgres://x/y\n\nPORT=3000\n");
    expect(entries).toEqual([
      { name: "DATABASE_URL", value: "postgres://x/y" },
      { name: "PORT", value: "3000" },
    ]);
    expect(issues).toEqual([]);
  });

  test("handles export, quotes, spaces around = and trailing comments", () => {
    const { entries } = parseEnv(
      `export A = 1\nB="two words" # note\nC='it'\nD=plain # comment\nE=a#b\nF=`,
    );
    expect(entries).toEqual([
      { name: "A", value: "1" },
      { name: "B", value: "two words" },
      { name: "C", value: "it" },
      { name: "D", value: "plain" },
      { name: "E", value: "a#b" },
      { name: "F", value: "" },
    ]);
  });

  test("keeps = inside values and expands escapes only in double quotes", () => {
    const { entries } = parseEnv("URL=https://a/?q=1&r=2\nX=\"a\\nb\"\nY='a\\nb'");
    expect(entries).toEqual([
      { name: "URL", value: "https://a/?q=1&r=2" },
      { name: "X", value: "a\nb" },
      { name: "Y", value: "a\\nb" },
    ]);
  });

  test("reads a quoted value over several lines", () => {
    const { entries } = parseEnv('KEY="-----BEGIN-----\nabc\n-----END-----"\nNEXT=1');
    expect(entries).toEqual([
      { name: "KEY", value: "-----BEGIN-----\nabc\n-----END-----" },
      { name: "NEXT", value: "1" },
    ]);
  });

  test("a later line with the same name wins; CRLF works", () => {
    expect(parseEnv("A=1\r\nA=2\r\n").entries).toEqual([{ name: "A", value: "2" }]);
  });

  test("reports reserved names and lines it cannot read", () => {
    const { entries, issues } = parseEnv("PATH=/bin\nGITHUB_TOKEN=x\nnot a variable\nOK=1");
    expect(entries).toEqual([{ name: "OK", value: "1" }]);
    expect(issues.map((issue) => [issue.line, issue.reason])).toEqual([
      [1, "Reserved for Aven's own use"],
      [2, "Reserved for Aven's own use"],
      [3, "Not NAME=value"],
    ]);
  });
});

describe("looksLikeEnv", () => {
  test("is true for NAME=value and for several lines, false for a plain value", () => {
    expect(looksLikeEnv("API_KEY=abc")).toBe(true);
    expect(looksLikeEnv("A=1\nB=2")).toBe(true);
    expect(looksLikeEnv("DATABASE_URL")).toBe(false);
    expect(looksLikeEnv("just some words")).toBe(false);
  });
});
