import { useMemo, useRef, useState, type FormEvent } from "react";

import { toast } from "@/components/toast";

import { parseEnv } from "../parse-env";
import { isReservedName, type Variable, type VariableScope } from "../types";
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
  const [pasted, setPasted] = useState<string | null>(null);
  const parsed = useMemo(() => parseEnv(pasted ?? ""), [pasted]);

  const reset = () => {
    setSecret(variable?.secret ?? false);
    setPasted(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pasted !== null) {
      if (parsed.entries.length === 0) return;
      setSubmitting(true);
      const saved = await saveMany(parsed.entries, secret);
      setSubmitting(false);
      if (saved) {
        reset();
        onDone();
      }
      return;
    }
    const data = new FormData(formRef.current ?? undefined);
    const name = variable?.name ?? String(data.get("name") ?? "").trim();
    if (isReservedName(name)) {
      toast.add({
        title: "Could not save variable",
        description: `${name} is reserved for Aven's own use`,
        type: "error",
      });
      return;
    }
    setSubmitting(true);
    const saved = await save({ name, value: String(data.get("value") ?? ""), secret });
    setSubmitting(false);
    if (saved) {
      reset();
      onDone();
    }
  }

  return { formRef, secret, setSecret, submitting, reset, submit, pasted, setPasted, parsed };
}
