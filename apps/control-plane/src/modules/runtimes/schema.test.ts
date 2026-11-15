import { describe, expect, test } from "bun:test";

import { createRuntimeBody } from "./schema";

describe("create runtime body", () => {
  test("a name alone is a computer someone installs", () => {
    expect(createRuntimeBody.parse({ name: "laptop" })).toEqual({ name: "laptop" });
  });

  test("a boat runtime needs a boat key", () => {
    expect(
      createRuntimeBody.safeParse({ provider: "boat", name: "cloud", apiKey: "sk-nope" }).success,
    ).toBe(false);
    expect(
      createRuntimeBody.parse({
        provider: "boat",
        name: "cloud",
        apiKey: "boat_live_key",
        machineType: "large",
      }),
    ).toMatchObject({ provider: "boat", apiKey: "boat_live_key", machineType: "large" });
  });
});
