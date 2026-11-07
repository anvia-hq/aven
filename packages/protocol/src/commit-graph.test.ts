import { describe, expect, test } from "bun:test";

import { layoutGraph } from "./commit-graph";

const commit = (sha: string, ...parents: string[]) => ({ sha, parents });

describe("layoutGraph", () => {
  test("a straight history is one lane, each commit joined to the next", () => {
    const { rows, lanes } = layoutGraph([commit("c", "b"), commit("b", "a"), commit("a")]);
    expect(lanes).toBe(1);
    expect(rows).toEqual([
      { lane: 0, up: [], through: [], down: [0] },
      { lane: 0, up: [0], through: [], down: [0] },
      { lane: 0, up: [0], through: [], down: [] },
    ]);
  });

  test("a merge opens a lane for its second parent, and the two come back together at their base", () => {
    const { rows, lanes } = layoutGraph([
      commit("m", "b", "f"),
      commit("b", "a"),
      commit("f", "a"),
      commit("a"),
    ]);
    expect(lanes).toBe(2);
    expect(rows).toEqual([
      { lane: 0, up: [], through: [], down: [0, 1] },
      { lane: 0, up: [0], through: [1], down: [0] },
      { lane: 1, up: [1], through: [0], down: [1] },
      { lane: 0, up: [0, 1], through: [], down: [] },
    ]);
  });

  test("a second parent that a lane already waits for is joined, not given a lane of its own", () => {
    const { rows, lanes } = layoutGraph([
      commit("y", "a"),
      commit("z", "x", "a"),
      commit("x", "a"),
      commit("a"),
    ]);
    expect(lanes).toBe(2);
    expect(rows[1]).toEqual({ lane: 1, up: [], through: [0], down: [1, 0] });
  });

  test("a tip that no commit above leads to takes the first free lane, and lanes that end are reused", () => {
    const { rows, lanes } = layoutGraph([
      commit("t1", "a"),
      commit("t2", "b"),
      commit("a"),
      commit("t3", "c"),
    ]);
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0, 0]);
    expect(lanes).toBe(2);
  });

  test("a parent that is not on the page leaves its lane going down, and a page can begin mid-history", () => {
    const { rows } = layoutGraph([commit("b", "a"), commit("c", "z")]);
    expect(rows[0]).toEqual({ lane: 0, up: [], through: [], down: [0] });
    expect(rows[1]).toEqual({ lane: 1, up: [], through: [0], down: [1] });
    expect(layoutGraph([])).toEqual({ rows: [], lanes: 0 });
  });
});
