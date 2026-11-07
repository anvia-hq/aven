import { useEffect, useRef } from "react";

import { finishedSoundOn, playChime } from "@/lib/chime";

import { finishedThreads } from "../finished-threads";
import { useThreads } from "./use-threads";

export function useFinishedSound() {
  const { threads } = useThreads();
  const seen = useRef(new Map<string, boolean>());

  useEffect(() => {
    if (finishedThreads(seen.current, threads).length > 0 && finishedSoundOn()) {
      if (document.hidden || !document.hasFocus()) playChime();
    }
    seen.current = new Map(threads.map((thread) => [thread.id, thread.running]));
  }, [threads]);
}
