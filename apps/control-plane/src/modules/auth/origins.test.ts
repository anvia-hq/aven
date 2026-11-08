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

  test("a listed origin matches the Origin header a browser sends", () => {
    const origins = parseOrigins("http://localhost:5173, https://aven.example.com");
    expect(origins.includes("https://aven.example.com")).toBe(true);
    expect(origins.includes("http://localhost:5173")).toBe(true);
  });
});
