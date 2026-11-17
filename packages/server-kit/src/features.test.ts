import { describe, expect, test } from "bun:test";

import { featureChoice } from "./features";

describe("featureChoice", () => {
  const read = (value: string | undefined) => featureChoice("AVEN_X", value, ["off", "on"], "off");

  test("takes the fallback when nothing is set, and trims what is", () => {
    expect(read(undefined)).toBe("off");
    expect(read("")).toBe("off");
    expect(read("   ")).toBe("off");
    expect(read(" on ")).toBe("on");
  });

  test("names the variable and the choices when the value is not one of them", () => {
    expect(() => read("maybe")).toThrow('AVEN_X must be off or on, got "maybe"');
  });
});
