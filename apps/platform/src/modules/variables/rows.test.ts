import { describe, expect, test } from "bun:test";

import { canSaveRows, rowStates, rowsAfterPaste, rowsToSave } from "./rows";
import type { VariableRow } from "./types";

const row = (id: number, name: string, value: string): VariableRow => ({ id, name, value });

describe("rowStates", () => {
  test("a secret with no value is skipped, a plain one with none is saved empty", () => {
    const rows = [row(1, "A", "x"), row(2, "B", "")];
    expect(rowsToSave(rowStates(rows, true))).toEqual([{ name: "A", value: "x" }]);
    expect(rowsToSave(rowStates(rows, false))).toEqual([
      { name: "A", value: "x" },
      { name: "B", value: "" },
    ]);
  });

  test("a row with no name is left out and is not a problem", () => {
    const states = rowStates([row(1, "", "x"), row(2, "A", "y")], false);
    expect(states[0]).toMatchObject({ problem: null, skipped: true });
    expect(canSaveRows(states)).toBe(true);
  });

  test("nothing to save when every row is empty", () => {
    expect(canSaveRows(rowStates([row(1, "", "")], false))).toBe(false);
    expect(canSaveRows(rowStates([row(1, "A", "")], true))).toBe(false);
  });
});

describe("rowsAfterPaste", () => {
  const ids = () => {
    let next = 100;
    return () => ++next;
  };

  test("a paste into a filled row goes after it, and a name pasted again keeps the new value", () => {
    const rows = rowsAfterPaste(
      [row(1, "A", "old"), row(2, "C", "3")],
      1,
      [
        { name: "A", value: "new" },
        { name: "B", value: "2" },
      ],
      ids(),
    );
    expect(rows.map((item) => [item.name, item.value])).toEqual([
      ["A", "new"],
      ["B", "2"],
      ["C", "3"],
    ]);
  });
});
