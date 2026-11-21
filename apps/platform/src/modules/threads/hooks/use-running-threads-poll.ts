import { useEffect } from "react";

const RUNNING_REFRESH_MS = 5000;

export function useRunningThreadsPoll(anyRunning: boolean, refresh: () => Promise<void>) {
  useEffect(() => {
    if (!anyRunning) return;

    const timer = setInterval(() => void refresh(), RUNNING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [anyRunning, refresh]);
}
