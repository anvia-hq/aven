import { describe, expect, test } from "bun:test";

import { balanceShards, extractPlaywrightTimings, verifyE2eReports } from "./e2e-shards";

describe("balanceShards", () => {
  test("balances files across shards using LPT timings", () => {
    const shards = balanceShards(["a.spec.ts", "b.spec.ts", "c.spec.ts", "d.spec.ts"], 2, {
      "a.spec.ts": 90,
      "b.spec.ts": 50,
      "c.spec.ts": 40,
      "d.spec.ts": 10,
    });

    expect(shards).toEqual([
      ["a.spec.ts", "d.spec.ts"],
      ["b.spec.ts", "c.spec.ts"],
    ]);
  });
});

describe("verifyE2eReports", () => {
  test("extracts durations and proves shards cover every discovered spec", () => {
    const report1 = {
      suites: [
        {
          file: "bots.spec.ts",
          specs: [{ tests: [{ results: [{ duration: 3000 }, { duration: 1500 }] }] }],
        },
      ],
    };
    const report2 = {
      suites: [
        {
          file: "e2e/ship.spec.ts",
          specs: [{ tests: [{ results: [{ duration: 4000 }] }] }],
        },
      ],
    };

    expect(extractPlaywrightTimings(report1)).toEqual({
      version: 1,
      files: { "e2e/bots.spec.ts": 4500 },
    });

    const verified = verifyE2eReports(["e2e/bots.spec.ts", "e2e/ship.spec.ts"], [report1, report2]);
    expect(verified.missing).toEqual([]);
    expect(verified.duplicates).toEqual([]);
    expect(verified.merged.files).toEqual({
      "e2e/bots.spec.ts": 4500,
      "e2e/ship.spec.ts": 4000,
    });
  });
});
