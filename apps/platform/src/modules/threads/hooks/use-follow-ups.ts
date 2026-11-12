import { useEffect, useRef, useState } from "react";

import { postJson } from "@/lib/api";
import { useFollowUpSettings } from "@/modules/settings/hooks/use-follow-up-settings";

import type { ChatMessage } from "../types";

export function useFollowUps(
  threadId: string,
  loaded: boolean,
  running: boolean,
  messages: ChatMessage[],
) {
  const { settings } = useFollowUpSettings();
  const enabled = settings?.enabled ?? false;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const baseline = useRef<string | null | undefined>(undefined);
  const asked = useRef<string | null>(null);
  const last = messages.at(-1);
  const answered = last?.role === "assistant" ? last.id : null;

  useEffect(() => {
    baseline.current = undefined;
    asked.current = null;
    setSuggestions([]);
  }, [threadId]);

  useEffect(() => {
    if (running) setSuggestions([]);
  }, [running]);

  useEffect(() => {
    if (!loaded) return;
    if (baseline.current === undefined) {
      baseline.current = answered;
      return;
    }
    if (running || !enabled || answered === null) return;
    if (answered === baseline.current || answered === asked.current) return;
    asked.current = answered;
    let current = true;
    postJson<{ suggestions: string[] }>(`/threads/${threadId}/follow-ups`, {})
      .then((done) => current && setSuggestions(done.suggestions))
      .catch(() => undefined);
    return () => void (current = false);
  }, [loaded, running, enabled, answered, threadId]);

  return { suggestions, clear: () => setSuggestions([]) };
}
