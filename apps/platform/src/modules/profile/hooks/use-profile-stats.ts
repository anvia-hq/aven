import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import type { ProfileStats } from "../types";

export function useProfileStats() {
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api<ProfileStats>("/profile/stats")
      .then((loaded) => {
        if (live) setStats(loaded);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return { stats, failed };
}
