import { useEffect, useRef } from "react";

import { finishedSoundOn, playChime } from "@/lib/chime";

import { finishedThreads } from "../finished-threads";
import { useThreads } from "./use-threads";

// A quiet chime when the agent of one of the person's threads finishes while they are looking at
// something else: another tab or window, or another app. While the tab has their attention the
// thread says so itself, so there is no sound.
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
