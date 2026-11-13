import { describe, expect, test } from "bun:test";

import { previewHost, previewHostname } from "./host";

const id = "00000000-0000-4000-8000-000000000001";

describe("a preview's host", () => {
  test("names one port of one runtime", () => {
    expect(previewHost(`3000-${id}.aven.run`, "aven.run")).toEqual({ port: 3000, runtimeId: id });
    expect(previewHost(`3000-${id}.aven.run:8443`, "aven.run")).toEqual({
      port: 3000,
      runtimeId: id,
    });
    expect(previewHostname({ port: 5173, runtimeId: id }, "preview.example.com")).toBe(
      `5173-${id}.preview.example.com`,
    );
  });

  test("is refused when it is aven.run itself, an extra label or another domain", () => {
    for (const host of [
      "aven.run",
      `x.3000-${id}.aven.run`,
      `3000-${id}.appen.run`,
      `3000-${id}.aven.run.example`,
      `3000-${id}.aven.run.`,
      `03000-${id}.aven.run`,
      `65536-${id}.aven.run`,
      `0-${id}.aven.run`,
      `3000-${id}`,
      "3000-aven.run",
      "",
    ]) {
      expect(previewHost(host, "aven.run")).toBeNull();
    }
  });

  test("keeps a port and a runtime id apart", () => {
    expect(previewHost(`3000-${id}.example.com`, "example.com")).toEqual({
      port: 3000,
      runtimeId: id,
    });
    expect(previewHost(`3000-${id}.example.com`, "aven.run")).toBeNull();
  });
});
