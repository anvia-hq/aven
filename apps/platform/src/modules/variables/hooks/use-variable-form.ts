import { useRef, useState, type FormEvent } from "react";

import { toast } from "@/components/toast";

import { isReservedName, type Variable } from "../types";
import { useVariables } from "./use-variables";

// The state behind the variable dialog: whether the value is a secret, and submitting, which adds
// a variable or, given one, replaces its value. Text fields are uncontrolled; they are read from
// the form when needed.
export function useVariableForm(
  projectId: string,
  variable: Variable | undefined,
  onDone: () => void,
) {
  const [secret, setSecret] = useState(variable?.secret ?? false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { save } = useVariables(projectId);

  const reset = () => setSecret(variable?.secret ?? false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  return { formRef, secret, setSecret, submitting, reset, submit };
}
