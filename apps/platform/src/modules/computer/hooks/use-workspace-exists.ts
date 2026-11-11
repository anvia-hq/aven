import { useRequest } from "@/hooks/use-request";

import type { Computer } from "../types";

type Folder = { available: boolean };

export function useWorkspaceExists({ path }: Computer) {
  const answer = useRequest<Folder>(`${path}/files?path=`, { key: "workspace", resetOn: path });
  if (!answer) return null;
  return answer.data ? answer.data.available : true;
}
