import { Badge } from "@/components/badge";

import { useRuntimes } from "../hooks/use-runtimes";

// The runner a project's sandboxes run on.
export function RuntimeBadge({ runtimeId }: { runtimeId: string }) {
  const { runtimes, loaded } = useRuntimes();

  if (!loaded) return null;
  const runtime = runtimes.find((candidate) => candidate.id === runtimeId);
  if (!runtime) return <Badge variant="destructive">Runner revoked</Badge>;
  return (
    <Badge variant={runtime.online ? "secondary" : "outline"}>
      {runtime.name} · {runtime.online ? "online" : "offline"}
    </Badge>
  );
}
