import { Badge } from "@/components/badge";

import { useRuntimes } from "../hooks/use-runtimes";

// Where a project's files, and so its agent, live.
export function RuntimeBadge({ runtimeId }: { runtimeId: string | null }) {
  const { runtimes, loaded } = useRuntimes();

  if (!runtimeId) return <Badge variant="outline">Control plane</Badge>;
  if (!loaded) return null;
  const runtime = runtimes.find((candidate) => candidate.id === runtimeId);
  if (!runtime) return <Badge variant="destructive">Runtime revoked</Badge>;
  return (
    <Badge variant={runtime.online ? "secondary" : "outline"}>
      {runtime.name} · {runtime.online ? "online" : "offline"}
    </Badge>
  );
}
