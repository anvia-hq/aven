import { useEffect, useRef, useState } from "react";

import { toast } from "@/components/toast";
import { useRequest } from "@/hooks/use-request";
import { attempt, postJson } from "@/lib/api";

import type { SnapshotState } from "../types";

const POLL_MS = 3_000;

export function useEnvironmentSnapshot(threadId: string, saves = 0) {
  const [looked, setLooked] = useState(0);
  const [asking, setAsking] = useState(false);
  const [running, setRunning] = useState(false);
  const answer = useRequest<SnapshotState>(`/threads/${threadId}/environment`, {
    pollMs: running ? POLL_MS : undefined,
    resetOn: threadId,
    refreshKey: `${looked}:${saves}`,
  });
  const snapshot = answer?.data ?? null;
  const was = useRef<SnapshotState | null>(null);

  useEffect(() => {
    setRunning(snapshot?.state === "running");
    const before = was.current;
    was.current = snapshot;
    if (!snapshot || before?.state !== "running" || snapshot.state !== "idle") return;
    if (snapshot.error) {
      toast.add({ title: "Snapshot failed", description: snapshot.error, type: "error" });
    } else {
      toast.add({
        title: "Snapshot saved",
        description: "New threads on this repository start from it",
        type: "success",
      });
    }
  }, [snapshot]);

  async function take() {
    setAsking(true);
    const started = await attempt("Could not take the snapshot", () =>
      postJson<SnapshotState>(`/threads/${threadId}/environment/snapshot`, {}),
    );
    setAsking(false);
    if (!started) return;
    setRunning(true);
    setLooked((count) => count + 1);
  }

  return {
    loaded: answer !== null,
    snapshot,
    busy: asking || snapshot?.state === "running",
    take,
  };
}
