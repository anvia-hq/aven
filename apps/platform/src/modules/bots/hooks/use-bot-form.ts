import { useRef, useState, type FormEvent } from "react";

import type { Bot } from "../types";
import { useBots } from "./use-bots";

// The state behind the bot's settings dialog: submitting what was written. Text fields are
// uncontrolled; they are read from the form when it is sent.
export function useBotForm(bot: Bot, onDone: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { update } = useBots();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(formRef.current ?? undefined);
    setSubmitting(true);
    const saved = await update(bot, {
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      avatar: String(data.get("avatar") ?? "").trim(),
      instruction: String(data.get("instruction") ?? "").trim(),
    });
    setSubmitting(false);
    if (saved) onDone();
  }

  return { formRef, submitting, submit };
}
