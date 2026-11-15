import { describe, expect, test } from "bun:test";

import { createRuntimeBody } from "./schema";

describe("create runtime body", () => {
  test("a name alone is a computer someone installs", () => {
    expect(createRuntimeBody.parse({ name: "laptop" })).toEqual({ name: "laptop" });
  });

  test("a boat key is not something a person can bring", () => {
    expect(
      createRuntimeBody.parse({ provider: "boat", name: "cloud", apiKey: "boat_live_key" }),
    ).toEqual({ name: "cloud" });
  });
});
