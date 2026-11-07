import { Badge } from "@/components/badge";

import { useRuntime } from "../hooks/use-runtime";
import { runtimeLabel } from "../runtime-label";

export function RuntimeBadge({ runtimeId }: { runtimeId: string }) {
  const { runtime, loaded } = useRuntime(runtimeId);

  if (!loaded) return null;
  if (!runtime) return <Badge variant="destructive">Runner revoked</Badge>;
  return <Badge variant={runtime.online ? "secondary" : "outline"}>{runtimeLabel(runtime)}</Badge>;
}
