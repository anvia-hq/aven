import { describe, expect, test } from "bun:test";

import { resolveLens } from "./resolve-lens";

describe("resolveLens", () => {
  test("prefixes relative proxy paths with the control plane origin and leaves absolute URLs unchanged", () => {
    expect(resolveLens("https://aven.sh/api")).toBeUndefined();
    expect(
      resolveLens("https://aven.sh/api", {
        baseUrl: "/runtimes/lens",
        publicKey: "rt-1",
        secretKey: "avlens_tok",
        captureMode: "full",
      }),
    ).toEqual({
      baseUrl: "https://aven.sh/api/runtimes/lens",
      publicKey: "rt-1",
      secretKey: "avlens_tok",
      captureMode: "full",
    });
    expect(
      resolveLens("https://aven.sh/api", {
        baseUrl: "https://lens.example.com",
        publicKey: "pk",
        secretKey: "sk",
      }),
    ).toEqual({
      baseUrl: "https://lens.example.com",
      publicKey: "pk",
      secretKey: "sk",
    });
  });
});
