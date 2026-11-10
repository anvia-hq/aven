import type { useComposer } from "@anvia/react-ui/chat";
import { useEffect, useState } from "react";

import { safeStorage } from "@/hooks/use-local-storage";
import { forgetStoredKeysStartingWith, registerUserState } from "@/lib/user-state";

const DRAFT_PREFIX = "aven.thread.";
const DRAFT_SUFFIX = ".draft";

registerUserState(() => forgetStoredKeysStartingWith(DRAFT_PREFIX));

type Composer = ReturnType<typeof useComposer>;
type Draft = { input: string; entities: Composer["entities"] };

function readDraft(key: string): Draft | null {
  const raw = safeStorage.getItem(key);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.input !== "string") return null;
    return { input: parsed.input, entities: Array.isArray(parsed.entities) ? parsed.entities : [] };
  } catch {
    return null;
  }
}

export function useComposerDraft(threadId: string | undefined, composer: Composer) {
  const key = threadId === undefined ? null : `${DRAFT_PREFIX}${threadId}${DRAFT_SUFFIX}`;
  const [restored, setRestored] = useState(false);
  const { input, entities, setInput, setEntities } = composer;

  useEffect(() => {
    if (key !== null) {
      const draft = readDraft(key);
      if (draft) {
        setInput(draft.input);
        setEntities(draft.entities);
      }
    }
    setRestored(true);
  }, [key, setInput, setEntities]);

  useEffect(() => {
    if (key === null || !restored) return;
    if (input === "") safeStorage.removeItem(key);
    else safeStorage.setItem(key, JSON.stringify({ input, entities }));
  }, [key, restored, input, entities]);
}
