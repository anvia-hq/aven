import { describe, expect, test } from "bun:test";

import { featureChoice, featureList } from "./features";

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

describe("featureList", () => {
  const read = (value: string | undefined) => featureList("AVEN_Y", value, ["a", "b", "c"]);

  test("nothing set is an empty list, and names are trimmed, listed once and in the order they are allowed", () => {
    expect(read(undefined)).toEqual([]);
    expect(read("")).toEqual([]);
    expect(read(" , ")).toEqual([]);
    expect(read("b, a ,b")).toEqual(["a", "b"]);
  });

  test("names every entry that is not allowed", () => {
    expect(() => read("a,x,y")).toThrow("AVEN_Y names x, y, which is not one of a, b, c");
  });
});
