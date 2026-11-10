import { useMemo, useRef, useState, type FormEvent } from "react";

import { parseEnv } from "../parse-env";
import { canSaveRows, rowStates, rowsAfterPaste, rowsToSave } from "../rows";
import { type EnvIssue, type Variable, type VariableRow, type VariableScope } from "../types";
import { useVariables } from "./use-variables";

export function useVariableForm(
  scope: VariableScope,
  variable: Variable | undefined,
  onDone: () => void,
) {
  const [secret, setSecret] = useState(variable?.secret ?? false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { save, saveMany } = useVariables(scope);
  const lastId = useRef(0);
  const nextId = () => ++lastId.current;
  const blankRow = (): VariableRow => ({ id: nextId(), name: "", value: "" });
  const [rows, setRows] = useState<VariableRow[] | null>(() =>
    variable === undefined ? [blankRow()] : null,
  );
  const [issues, setIssues] = useState<EnvIssue[]>([]);
  const states = useMemo(() => rowStates(rows ?? [], secret), [rows, secret]);
  const entries = useMemo(() => rowsToSave(states), [states]);
  const savable = canSaveRows(states);

  const changeRow = (id: number, change: { name?: string; value?: string }) =>
    setRows(
      (current) =>
        current?.map((row) =>
          row.id === id
            ? { id, name: change.name ?? row.name, value: change.value ?? row.value }
            : row,
        ) ?? null,
    );

  const removeRow = (id: number) =>
    setRows((current) => {
      const left = current?.filter((row) => row.id !== id) ?? [];
      return left.length > 0 ? left : [blankRow()];
    });

  const addRow = () => setRows((current) => (current ? [...current, blankRow()] : [blankRow()]));

  const pasteIntoRow = (id: number, text: string) => {
    const parsed = parseEnv(text);
    setIssues(parsed.issues);
    setRows((current) => rowsAfterPaste(current ?? [], id, parsed.entries, nextId));
  };

  const reset = () => {
    setSecret(variable?.secret ?? false);
    setRows(variable === undefined ? [blankRow()] : null);
    setIssues([]);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rows !== null) {
      if (!savable) return;
      setSubmitting(true);
      const saved = await saveMany(entries, secret);
      setSubmitting(false);
      if (saved) {
        reset();
        onDone();
      }
      return;
    }
    const data = new FormData(formRef.current ?? undefined);
    const name = variable?.name ?? String(data.get("name") ?? "").trim();
    setSubmitting(true);
    const saved = await save({ name, value: String(data.get("value") ?? ""), secret });
    setSubmitting(false);
    if (saved) {
      reset();
      onDone();
    }
  }

  return {
    formRef,
    secret,
    setSecret,
    submitting,
    reset,
    submit,
    rows,
    states,
    issues,
    count: entries.length,
    savable,
    changeRow,
    removeRow,
    addRow,
    pasteIntoRow,
  };
}
