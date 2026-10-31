import { describe, expect, test } from "bun:test";

import { startedOnUse } from "./started-on-use";

describe("startedOnUse", () => {
  const make = () => {
    const log: string[] = [];
    const target = {
      id: "s1",
      async read(path: string) {
        log.push(`read ${path}`);
        return path.toUpperCase();
      },
      async *execStream() {
        log.push("execStream");
        yield 1;
        yield 2;
      },
    };
    const start = async () => void log.push("start");
    return { log, wrapped: startedOnUse(target, start) };
  };

  test("starts before the call, and gives back what the call gives", async () => {
    const { log, wrapped } = make();
    expect(await wrapped.read("a")).toBe("A");
    expect(log).toEqual(["start", "read a"]);
  });

  test("a stream starts the container first and then streams, still as a stream", async () => {
    const { log, wrapped } = make();
    const seen: number[] = [];
    for await (const item of wrapped.execStream()) seen.push(item);
    expect(seen).toEqual([1, 2]);
    expect(log).toEqual(["start", "execStream"]);
  });

  test("a plain property is passed through and starts nothing", () => {
    const { log, wrapped } = make();
    expect(wrapped.id).toBe("s1");
    expect(log).toEqual([]);
  });

  test("nothing starts until something is called", () => {
    const { log } = make();
    expect(log).toEqual([]);
  });
});
