import { Badge } from "@/components/badge";

import { useRuntimes } from "../hooks/use-runtimes";

// The runner a project's sandboxes run on.
export function RuntimeBadge({ runtimeId }: { runtimeId: string | null }) {
  const { runtimes, loaded } = useRuntimes();

  if (!runtimeId) return <Badge variant="destructive">No runner</Badge>;
  if (!loaded) return null;
  const runtime = runtimes.find((candidate) => candidate.id === runtimeId);
  if (!runtime) return <Badge variant="destructive">Runner revoked</Badge>;
  return (
    <Badge variant={runtime.online ? "secondary" : "outline"}>
      {runtime.name} · {runtime.online ? "online" : "offline"}
    </Badge>
  );
}
