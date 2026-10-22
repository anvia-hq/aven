import { useAtomValue } from "jotai";

import { activityAtom } from "../atoms/activity-atom";
import type { ActivityKind } from "../types";

export function useActivity(kind: ActivityKind | "all") {
  const events = useAtomValue(activityAtom);
  return events.filter((event) => kind === "all" || event.kind === kind);
}
