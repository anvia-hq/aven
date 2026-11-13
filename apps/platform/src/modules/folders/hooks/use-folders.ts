import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

import type { Folder } from "../types";
import { useFoldersKey } from "./use-folders-key";

export function useFolders() {
  const queryKey = useFoldersKey();
  const query = useQuery({
    queryKey,
    queryFn: () => api<Folder[]>("/folders"),
    enabled: queryKey[1] !== null,
  });
  return { folders: query.data ?? [], loaded: query.data !== undefined };
}
