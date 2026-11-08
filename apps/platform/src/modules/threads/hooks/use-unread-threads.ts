import { useRouterState } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useEffect, useRef } from "react";

import { unreadAtom } from "../atoms/unread-atom";
import { finishedThreads } from "../finished-threads";
import { nextUnread } from "../unread-threads";
import { useThreads } from "./use-threads";

const THREAD_PATH = /^\/threads\/([^/]+)$/;

export function useUnreadThreads() {
  const { threads } = useThreads();
  const [unread, setUnread] = useAtom(unreadAtom);
  const seen = useRef(new Map<string, boolean>());
  const openId = useRouterState({
    select: (state) => THREAD_PATH.exec(state.location.pathname)?.[1],
  });

  useEffect(() => {
    const finished = finishedThreads(seen.current, threads).map((thread) => thread.id);
    seen.current = new Map(threads.map((thread) => [thread.id, thread.running]));
    if (threads.length === 0) return;
    setUnread((current) =>
      nextUnread(
        current,
        finished,
        openId,
        threads.map((thread) => thread.id),
      ),
    );
  }, [threads, openId, setUnread]);

  return new Set(unread);
}
