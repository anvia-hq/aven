import { useState } from "react";

import { useRequest } from "@/hooks/use-request";

import type { Computer } from "../computer";
import type { DesktopStatus } from "../types";

const POLL_MS = 5_000;

export function useDesktopStatus({ path }: Computer) {
  const [refreshCount, setRefreshCount] = useState(0);

  const answer = useRequest<DesktopStatus>(`${path}/desktop`, {
    key: "desktop",
    pollMs: POLL_MS,
    resetOn: path,
    refreshKey: refreshCount,
  });

  const refresh = () => setRefreshCount((count) => count + 1);

  return { status: answer?.data ?? null, problem: answer?.error ?? null, refresh };
}
