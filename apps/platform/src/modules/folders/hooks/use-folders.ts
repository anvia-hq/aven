import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

import type { Folder } from "../types";

export function useFoldersKey() {
  const { data: session } = authClient.useSession();
  return ["folders", session?.user.id ?? null] as const;
}

export function useFolders() {
  const queryKey = useFoldersKey();
  const query = useQuery({
    queryKey,
    queryFn: () => api<Folder[]>("/folders"),
    enabled: queryKey[1] !== null,
  });
  return { folders: query.data ?? [], loaded: query.data !== undefined };
}
