import { useState } from "react";

import { toast } from "@/components/toast";
import { useRequest } from "@/hooks/use-request";
import { attempt, postJson } from "@/lib/api";

import type { FolderListing } from "../types";

export function useFolderBrowser(runtimeId: string, path: string, onOpen: (path: string) => void) {
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  const listing = useRequest<FolderListing>(
    runtimeId ? `/runtimes/${runtimeId}/folders${query}` : null,
    {
      resetOn: runtimeId,
      refreshKey,
    },
  );

  async function createFolder(name: string) {
    if (!path || !name.trim()) return false;
    setCreating(true);
    const made = await attempt("Could not create the folder", () =>
      postJson<{ path: string }>(`/runtimes/${runtimeId}/folders`, { path, name }),
    );
    setCreating(false);
    if (!made) return false;
    toast.add({ title: "Folder created", description: made.path, type: "success" });
    setRefreshKey((key) => key + 1);
    onOpen(made.path);
    return true;
  }

  return { listing, creating, createFolder };
}
