import {
  MAX_NAME_LENGTH,
  MAX_VALUE_LENGTH,
  MAX_VARIABLES,
  isReservedName,
  type ParsedEntry,
  type RowProblem,
  type RowState,
  type VariableRow,
} from "./types";

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const PROBLEM_TEXT: Record<RowProblem, string> = {
  name: "Use letters, digits and underscores, not starting with a digit",
  reserved: "Reserved for Aven's own use, so it cannot be saved. Rename or remove it.",
  duplicate: "Named twice",
  long: "The value is too long",
};

function problemOf(row: VariableRow, rows: readonly VariableRow[]): RowProblem | null {
  const name = row.name.trim();
  if (name === "") return null;
  if (name.length > MAX_NAME_LENGTH || !NAME.test(name)) return "name";
  if (isReservedName(name)) return "reserved";
  if (rows.some((other) => other.id !== row.id && other.name.trim() === name)) return "duplicate";
  if (row.value.length > MAX_VALUE_LENGTH) return "long";
  return null;
}

export function rowStates(rows: readonly VariableRow[], secret: boolean): RowState[] {
  return rows.map((row) => ({
    row,
    problem: problemOf(row, rows),
    skipped: row.name.trim() === "" || (secret && row.value === ""),
  }));
}

export function rowsToSave(states: readonly RowState[]): ParsedEntry[] {
  return states
    .filter((state) => !state.skipped)
    .map(({ row }) => ({ name: row.name.trim(), value: row.value }));
}

export const canSaveRows = (states: readonly RowState[]) => {
  const count = states.filter((state) => !state.skipped).length;
  return (
    count > 0 &&
    count <= MAX_VARIABLES &&
    states.every((state) => state.skipped || state.problem === null)
  );
};

export function rowsAfterPaste(
  rows: readonly VariableRow[],
  id: number,
  entries: readonly ParsedEntry[],
  nextId: () => number,
): VariableRow[] {
  const index = rows.findIndex((row) => row.id === id);
  const target = rows[index];
  const added = entries.map((entry) => ({ id: nextId(), ...entry }));
  const replaced = target !== undefined && target.name.trim() === "" && target.value === "";
  const before = rows.slice(0, replaced ? index : index + 1);
  const after = rows.slice(index + 1);
  const merged = [...before, ...added, ...after];
  const byName = new Map<string, number>();
  merged.forEach((row, position) => {
    const name = row.name.trim();
    if (name !== "") byName.set(name, position);
  });
  return merged.filter((row, position) => {
    const name = row.name.trim();
    return name === "" || byName.get(name) === position;
  });
}
