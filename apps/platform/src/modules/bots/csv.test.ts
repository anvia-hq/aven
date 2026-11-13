import { describe, expect, test } from "bun:test";

import { parseCsv } from "./csv";

describe("parseCsv", () => {
  test("reads rows and cells, quoted cells with commas, quotes and line breaks, and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n"two\nlines",z\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "z"],
    ]);
  });

  test("keeps a last row without a line break and an empty cell", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
    expect(parseCsv("")).toEqual([]);
  });
});
