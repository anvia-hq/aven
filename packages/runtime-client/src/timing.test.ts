import { afterEach, describe, expect, test } from "bun:test";

import { timing } from "./timing";

describe("the timing of a run's start-up", () => {
  const written: string[] = [];
  const real = console.log;
  afterEach(() => {
    console.log = real;
    delete process.env.AVEN_TIMING;
    written.length = 0;
  });
  const record = () => {
    console.log = (...parts: unknown[]) => void written.push(parts.join(" "));
  };

  test("says nothing when AVEN_TIMING is not set", () => {
    record();
    timing("run 1").mark("sandbox");
    expect(written).toEqual([]);
  });

  test("prints a line for each step, with what it took and the total", () => {
    process.env.AVEN_TIMING = "1";
    record();
    const clock = timing("run 1");
    clock.mark("sandbox");
    clock.mark("mcp");
    expect(written.length).toBe(2);
    expect(written[0]).toMatch(/^\[timing\] run 1 sandbox \d+ms \(\d+ms\)$/);
    expect(written[1]).toMatch(/^\[timing\] run 1 mcp \d+ms \(\d+ms\)$/);
  });
});
