import { useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, postJson } from "@/lib/api";
import { finishedSoundOn, playMention } from "@/lib/chime";
import { refreshMentions } from "@/modules/mentions/hooks/use-mentions";

import { newMentions, unopened } from "../mentioned-threads";

const THREAD_PATH = /^\/threads\/([^/]+)$/;
const LOOK_MS = 15_000;

export function useMentionedThreads() {
  const [waiting, setWaiting] = useState<string[]>([]);
  const known = useRef<string[] | null>(null);
  const route = useRouterState({ select: (state) => state.location });
  const split = (route.search as { split?: string }).split;
  const open = [THREAD_PATH.exec(route.pathname)?.[1], split];
  const openRef = useRef(open);
  openRef.current = open;

  const look = useCallback(async () => {
    try {
      const ids = await api<string[]>("/threads/mentioned");
      const fresh = newMentions(known.current, ids, openRef.current);
      known.current = ids;
      setWaiting(ids);

      if (fresh.length > 0 && finishedSoundOn()) playMention();
    } catch {}
  }, []);

  useEffect(() => {
    void look();
    const timer = setInterval(() => {
      if (!document.hidden) void look();
    }, LOOK_MS);
    window.addEventListener("focus", look);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", look);
    };
  }, [look]);

  const openKey = open.join("|");
  useEffect(() => {
    const seen = waiting.filter((id) => openRef.current.includes(id));

    if (seen.length === 0) return;

    known.current = (known.current ?? []).filter((id) => !seen.includes(id));
    setWaiting((current) => current.filter((id) => !seen.includes(id)));
    for (const id of seen) {
      void postJson(`/threads/${id}/mentions/seen`, {})
        .then(refreshMentions)
        .catch(() => undefined);
    }
  }, [openKey, waiting]);

  return new Set(unopened(waiting, open));
}
