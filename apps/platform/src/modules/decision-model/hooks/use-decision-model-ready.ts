import { useRequest } from "@/hooks/use-request";

import type { DecisionModel } from "../types";

export function useDecisionModelReady(enabled: boolean) {
  const answer = useRequest<{ decisionModel: DecisionModel | null }>(
    enabled ? "/decision-model" : null,
  );
  return answer?.data ? answer.data.decisionModel !== null : null;
}
