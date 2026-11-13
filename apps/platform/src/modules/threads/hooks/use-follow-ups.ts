import { useEffect, useRef, useState } from "react";

import { lastSubmission } from "@aven/protocol/submitter";

import { postJson } from "@/lib/api";
import { useFollowUpSettings } from "@/modules/settings/hooks/use-follow-up-settings";

import { authorOf } from "../message-author";
import type { ChatMessage, Viewer } from "../types";

export function useFollowUps(
  threadId: string,
  loaded: boolean,
  running: boolean,
  messages: ChatMessage[],
  viewer: Viewer,
) {
  const { settings } = useFollowUpSettings();
  const enabled = settings?.enabled ?? false;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const baseline = useRef<string | null | undefined>(undefined);
  const asked = useRef<string | null>(null);
  const last = messages.at(-1);
  const answered = last?.role === "assistant" ? last.id : null;
  const submission = lastSubmission(messages);
  const submitted =
    submission === undefined ||
    authorOf(
      submission.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
      viewer,
      submission.senderId,
    ).mine;

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

    if (running || !enabled || !submitted || answered === null) return;

    if (answered === baseline.current || answered === asked.current) return;

    asked.current = answered;
    let current = true;
    postJson<{ suggestions: string[] }>(`/threads/${threadId}/follow-ups`, {})
      .then((done) => current && setSuggestions(done.suggestions))
      .catch(() => undefined);
    return () => void (current = false);
  }, [loaded, running, enabled, submitted, answered, threadId]);

  return { suggestions, clear: () => setSuggestions([]) };
}
