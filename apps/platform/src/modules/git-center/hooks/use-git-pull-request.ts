import { useCallback, useEffect, useState } from "react";

import { toast } from "@aven/ui/toast";
import { api, attempt, errorMessage, postJson } from "@/lib/api";

import type { GitCenterCheckLogResponse, GitCenterPullDetailResponse } from "../types";

export function useGitPullRequest(
  projectId: string,
  pullNumber: number | null,
  onMutated: () => void,
) {
  const [data, setData] = useState<GitCenterPullDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logsByCheck, setLogsByCheck] = useState<Record<number, GitCenterCheckLogResponse>>({});
  const [loadingCheckId, setLoadingCheckId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!pullNumber) {
      setData(null);
      return;
    }

    setLoading(true);
    try {
      const response = await api<GitCenterPullDetailResponse>(
        `/git-center/projects/${projectId}/pulls/${pullNumber}`,
      );
      setData(response);
    } catch (failure) {
      toast.add({
        title: "Could not load pull request",
        description: errorMessage(failure),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, pullNumber]);

  useEffect(() => {
    setLogsByCheck({});
    void load();
  }, [load]);

  const loadCheckLogs = useCallback(
    async (checkRunId: number) => {
      if (!pullNumber) return null;

      setLoadingCheckId(checkRunId);
      try {
        const result = await api<GitCenterCheckLogResponse>(
          `/git-center/projects/${projectId}/pulls/${pullNumber}/checks/${checkRunId}/logs`,
        );
        setLogsByCheck((prev) => ({ ...prev, [checkRunId]: result }));
        return result;
      } catch (failure) {
        toast.add({
          title: "Could not load CI logs",
          description: errorMessage(failure),
          type: "error",
        });
        return null;
      } finally {
        setLoadingCheckId(null);
      }
    },
    [projectId, pullNumber],
  );

  const review = useCallback(
    async (event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", body: string) => {
      if (!pullNumber) return false;

      setBusy(true);
      try {
        const res = await attempt("Could not submit review", () =>
          postJson<{ ok: true }>(`/git-center/projects/${projectId}/pulls/${pullNumber}/review`, {
            event,
            body,
          }),
        );

        if (!res) return false;

        toast.add({ title: "Review submitted", type: "success" });
        await load();
        onMutated();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [load, onMutated, projectId, pullNumber],
  );

  const merge = useCallback(
    async (method: "merge" | "squash" | "rebase" | "enqueue") => {
      if (!pullNumber) return false;

      setBusy(true);
      try {
        const res = await attempt("Could not merge pull request", () =>
          postJson<{ merged: boolean; queued: boolean; message: string }>(
            `/git-center/projects/${projectId}/pulls/${pullNumber}/merge`,
            { method },
          ),
        );

        if (!res) return false;

        toast.add({ title: res.message, type: "success" });
        await load();
        onMutated();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [load, onMutated, projectId, pullNumber],
  );

  const updateBranch = useCallback(async () => {
    if (!pullNumber) return false;

    setBusy(true);
    try {
      const res = await attempt("Could not update branch", () =>
        postJson<{ message: string }>(
          `/git-center/projects/${projectId}/pulls/${pullNumber}/update-branch`,
          {},
        ),
      );

      if (!res) return false;

      toast.add({ title: res.message, type: "success" });
      await load();
      onMutated();
      return true;
    } finally {
      setBusy(false);
    }
  }, [load, onMutated, projectId, pullNumber]);

  const setState = useCallback(
    async (state: "open" | "closed") => {
      if (!pullNumber) return false;

      setBusy(true);
      try {
        const res = await attempt(`Could not ${state === "closed" ? "close" : "reopen"} PR`, () =>
          postJson(`/git-center/projects/${projectId}/pulls/${pullNumber}`, { state }, "PATCH"),
        );

        if (!res) return false;

        toast.add({
          title: state === "closed" ? `Closed PR #${pullNumber}` : `Reopened PR #${pullNumber}`,
          type: "success",
        });
        await load();
        onMutated();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [load, onMutated, projectId, pullNumber],
  );

  const createPull = useCallback(
    async (input: {
      title: string;
      body?: string;
      head: string;
      base: string;
      draft?: boolean;
    }) => {
      setBusy(true);
      try {
        const res = await attempt("Could not create pull request", () =>
          postJson<{ number: number; title: string }>(
            `/git-center/projects/${projectId}/pulls`,
            input,
          ),
        );

        if (!res) return null;

        toast.add({ title: `Opened PR #${res.number}`, description: res.title, type: "success" });
        onMutated();
        return res;
      } finally {
        setBusy(false);
      }
    },
    [onMutated, projectId],
  );

  return {
    data,
    loading,
    busy,
    logsByCheck,
    loadingCheckId,
    reload: load,
    loadCheckLogs,
    review,
    merge,
    updateBranch,
    setState,
    createPull,
  };
}
