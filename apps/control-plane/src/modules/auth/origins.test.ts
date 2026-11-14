import { describe, expect, test } from "bun:test";

import { parseOrigins } from "./origins";

describe("parseOrigins", () => {
  test("trims each origin and drops empty entries", () => {
    expect(parseOrigins("http://a.example, http://b.example ,,")).toEqual([
      "http://a.example",
      "http://b.example",
    ]);
    expect(parseOrigins("  https://only.example  ")).toEqual(["https://only.example"]);
    expect(parseOrigins(" , ")).toEqual([]);
  });
});
