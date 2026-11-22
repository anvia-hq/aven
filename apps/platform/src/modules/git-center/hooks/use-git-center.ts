import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GitActionPayload } from "@aven/protocol/types";
import { toast } from "@aven/ui/toast";
import { api, attempt, errorMessage, postJson } from "@/lib/api";
import { useNewThreadComputer } from "@/modules/threads/hooks/use-new-thread-computer";

import {
  gitFiltersByProjectAtom,
  gitInspectorByProjectAtom,
  gitSnapshotsAtom,
  gitTargetByProjectAtom,
} from "../atoms/git-center-atoms";
import type {
  GitCenterActionResult,
  GitCenterCommitDetail,
  GitCenterFilters,
  GitCenterHandoffInput,
  GitCenterHandoffResult,
  GitCenterInspector,
  GitCenterReflogResponse,
  GitCenterSnapshot,
  GitCenterTarget,
  GitCenterWorkspaceResponse,
} from "../types";

const EMPTY_FILTERS: GitCenterFilters = {
  search: "",
  branch: null,
  author: "",
  path: "",
};

const DEFAULT_TARGET: GitCenterTarget = { kind: "project" };
const DEFAULT_INSPECTOR: GitCenterInspector = { kind: "wip" };

function snapshotUrl(projectId: string, filters: GitCenterFilters, page: number) {
  const params = new URLSearchParams();

  if (page > 1) params.set("page", String(page));

  if (filters.branch) params.set("branch", filters.branch);

  if (filters.search.trim()) params.set("search", filters.search.trim());

  if (filters.author.trim()) params.set("author", filters.author.trim());

  if (filters.path.trim()) params.set("path", filters.path.trim());

  const qs = params.toString();
  return `/git-center/projects/${projectId}/snapshot${qs ? `?${qs}` : ""}`;
}

export function useGitCenter(projectId: string) {
  const navigate = useNavigate();
  const computer = useNewThreadComputer();
  const [snapshots, setSnapshots] = useAtom(gitSnapshotsAtom);
  const [targets, setTargets] = useAtom(gitTargetByProjectAtom);
  const [inspectors, setInspectors] = useAtom(gitInspectorByProjectAtom);
  const [filtersMap, setFiltersMap] = useAtom(gitFiltersByProjectAtom);

  const snapshot = snapshots[projectId] ?? null;
  const target = targets[projectId] ?? DEFAULT_TARGET;
  const inspector = inspectors[projectId] ?? DEFAULT_INSPECTOR;
  const filters = filtersMap[projectId] ?? EMPTY_FILTERS;

  const [loading, setLoading] = useState(!snapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<GitCenterWorkspaceResponse | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ path: string; staged: boolean } | null>(null);

  const [commitDetail, setCommitDetail] = useState<GitCenterCommitDetail | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);

  const [reflog, setReflog] = useState<GitCenterReflogResponse["entries"]>([]);
  const [reflogLoading, setReflogLoading] = useState(false);

  const filtersKey = useMemo(
    () => `${filters.branch ?? ""}|${filters.search}|${filters.author}|${filters.path}`,
    [filters],
  );
  const reqSeq = useRef(0);

  const setTarget = useCallback(
    (next: GitCenterTarget) => {
      setTargets((prev) => ({ ...prev, [projectId]: next }));
      setSelectedFile(null);
    },
    [projectId, setTargets],
  );

  const setInspector = useCallback(
    (next: GitCenterInspector) => {
      setInspectors((prev) => ({ ...prev, [projectId]: next }));
    },
    [projectId, setInspectors],
  );

  const setFilters = useCallback(
    (updater: GitCenterFilters | ((prev: GitCenterFilters) => GitCenterFilters)) => {
      setFiltersMap((prev) => {
        const current = prev[projectId] ?? EMPTY_FILTERS;
        const next = typeof updater === "function" ? updater(current) : updater;
        return { ...prev, [projectId]: next };
      });
    },
    [projectId, setFiltersMap],
  );

  const fetchSnapshot = useCallback(
    async (opts?: { silent?: boolean; nextPage?: number }) => {
      const seq = ++reqSeq.current;
      const targetPage = opts?.nextPage ?? 1;

      if (targetPage > 1) {
        setLoadingMore(true);
      } else if (opts?.silent) {
        setRefreshing(true);
      } else {
        setLoading((prev) => prev || !snapshots[projectId]);
        setRefreshing(true);
      }

      try {
        const data = await api<GitCenterSnapshot>(snapshotUrl(projectId, filters, targetPage));

        if (reqSeq.current !== seq) return;

        setError(null);
        setPage(targetPage);
        setSnapshots((prev) => {
          if (targetPage === 1) return { ...prev, [projectId]: data };

          const existing = prev[projectId];

          if (!existing) return { ...prev, [projectId]: data };

          const seen = new Set(existing.commits.map((c) => c.sha));
          const appended = data.commits.filter((c) => !seen.has(c.sha));
          return {
            ...prev,
            [projectId]: {
              ...data,
              commits: [...existing.commits, ...appended],
            },
          };
        });
      } catch (failure) {
        if (reqSeq.current !== seq) return;

        setError(errorMessage(failure));
      } finally {
        if (reqSeq.current === seq) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [filters, projectId, setSnapshots, snapshots],
  );

  const fetchWorkspace = useCallback(
    async (file?: { path: string; staged: boolean } | null) => {
      if (snapshot?.mode !== "live") {
        setWorkspace(null);
        return;
      }

      setWorkspaceLoading(true);
      try {
        const params = new URLSearchParams();

        if (target.kind === "thread") params.set("threadId", target.threadId);

        const activeFile = file === undefined ? selectedFile : file;

        if (activeFile) {
          params.set("filePath", activeFile.path);
          params.set("staged", activeFile.staged ? "1" : "0");
        }

        const qs = params.toString();
        const data = await api<GitCenterWorkspaceResponse>(
          `/git-center/projects/${projectId}/workspace${qs ? `?${qs}` : ""}`,
        );
        setWorkspace(data);
      } catch {
        setWorkspace(null);
      } finally {
        setWorkspaceLoading(false);
      }
    },
    [projectId, selectedFile, snapshot?.mode, target],
  );

  useEffect(() => {
    void fetchSnapshot();
  }, [projectId, filtersKey]);

  const anyThreadRunning = snapshot?.threads.some((t) => t.running) ?? false;

  useEffect(() => {
    if (!anyThreadRunning) return;

    const timer = window.setInterval(() => {
      void fetchSnapshot({ silent: true });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [anyThreadRunning, fetchSnapshot]);

  useEffect(() => {
    const onFocus = () => {
      void fetchSnapshot({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchSnapshot]);

  useEffect(() => {
    if (inspector.kind === "wip" && snapshot?.mode === "live") {
      void fetchWorkspace();
    }
  }, [inspector.kind, snapshot?.mode, snapshot?.headSha, target, selectedFile]);

  useEffect(() => {
    if (inspector.kind !== "commit") {
      setCommitDetail(null);
      return;
    }

    let alive = true;
    setCommitLoading(true);
    void api<GitCenterCommitDetail>(`/git-center/projects/${projectId}/commits/${inspector.sha}`)
      .then((data) => {
        if (alive) setCommitDetail(data);
      })
      .catch((failure) => {
        if (alive) {
          toast.add({
            title: "Could not load commit",
            description: errorMessage(failure),
            type: "error",
          });
        }
      })
      .finally(() => {
        if (alive) setCommitLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [inspector, projectId]);

  const loadReflog = useCallback(async () => {
    setReflogLoading(true);
    try {
      const params = new URLSearchParams();

      if (target.kind === "thread") params.set("threadId", target.threadId);

      const qs = params.toString();
      const data = await api<GitCenterReflogResponse>(
        `/git-center/projects/${projectId}/reflog${qs ? `?${qs}` : ""}`,
      );
      setReflog(data.entries);
    } catch (failure) {
      toast.add({
        title: "Could not load reflog",
        description: errorMessage(failure),
        type: "error",
      });
    } finally {
      setReflogLoading(false);
    }
  }, [projectId, target]);

  const runAction = useCallback(
    async (action: GitActionPayload, overrideTarget?: GitCenterTarget) => {
      const effectiveTarget = overrideTarget ?? target;
      setBusyAction(action.op);
      try {
        const result = await attempt("Git action failed", () =>
          postJson<GitCenterActionResult>(`/git-center/projects/${projectId}/actions`, {
            target: effectiveTarget,
            action,
          }),
        );

        if (!result) return null;

        if (!result.ok && result.conflicts) {
          toast.add({
            title: "Merge conflicts detected",
            description: result.summary,
            type: "warning",
          });
          setTarget(effectiveTarget);
          setInspector({ kind: "wip" });
        } else {
          toast.add({ title: result.summary, type: "success" });
        }

        await fetchSnapshot({ silent: true });

        if (inspector.kind === "wip") await fetchWorkspace();

        return result;
      } finally {
        setBusyAction(null);
      }
    },
    [fetchSnapshot, fetchWorkspace, inspector.kind, projectId, setInspector, setTarget, target],
  );

  const handoff = useCallback(
    async (input: GitCenterHandoffInput) => {
      setBusyAction("handoff");
      try {
        const runtimeId = snapshot?.project.directory
          ? undefined
          : (input.runtimeId ?? computer.runtimeId);
        const body = runtimeId ? { ...input, runtimeId } : input;
        const result = await attempt("Could not hand off to agent", () =>
          postJson<GitCenterHandoffResult>(`/git-center/projects/${projectId}/handoff`, body),
        );

        if (!result) return null;

        toast.add({
          title: result.created ? "Started agent thread" : "Sent task to thread",
          type: "success",
        });
        await navigate({ to: "/threads/$threadId", params: { threadId: result.threadId } });
        return result;
      } finally {
        setBusyAction(null);
      }
    },
    [computer.runtimeId, navigate, projectId, snapshot?.project.directory],
  );

  return {
    snapshot,
    loading,
    refreshing,
    loadingMore,
    error,
    busyAction,
    target,
    setTarget,
    inspector,
    setInspector,
    filters,
    setFilters,
    workspace,
    workspaceLoading,
    selectedFile,
    setSelectedFile,
    commitDetail,
    commitLoading,
    reflog,
    reflogLoading,
    loadReflog,
    refresh: () => void fetchSnapshot({ silent: true }),
    loadMore: () => void fetchSnapshot({ nextPage: page + 1 }),
    runAction,
    handoff,
  };
}
