import { describe, expect, test } from "bun:test";

import { parseArgs, stringFlag } from "./args";

describe("parseArgs", () => {
  test("separates positionals from flags", () => {
    expect(parseArgs(["logs", "server", "--follow"])).toEqual({
      positionals: ["logs", "server"],
      flags: { follow: true },
    });
  });

  test("takes a value from the next word only for a valued flag", () => {
    const args = parseArgs(["--port", "3900", "--yes", "x"], ["port"]);
    expect(args.flags).toEqual({ port: "3900", yes: true });
    expect(args.positionals).toEqual(["x"]);
  });

  test("reads a single-letter flag", () => {
    expect(parseArgs(["logs", "-f"])).toEqual({ positionals: ["logs"], flags: { f: true } });
  });

  test("reads --name=value, keeping any = in the value", () => {
    expect(parseArgs(["--url=https://a/b?c=d"]).flags.url).toBe("https://a/b?c=d");
  });

  test("a valued flag with nothing after it is an error", () => {
    expect(() => parseArgs(["--port"], ["port"])).toThrow("--port needs a value");
  });
});

describe("stringFlag", () => {
  test("is the value, undefined when absent, and an error without a value", () => {
    expect(stringFlag(parseArgs(["--port=1"]), "port")).toBe("1");
    expect(stringFlag(parseArgs([]), "port")).toBeUndefined();
    expect(() => stringFlag(parseArgs(["--port"]), "port")).toThrow("--port needs a value");
  });
});
