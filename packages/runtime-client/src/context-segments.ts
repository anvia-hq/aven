import {
  estimateContextBreakdown,
  scaleContextBreakdown,
  type ContextBreakdownSource,
} from "@anvia/core";
import type { ContextSegment } from "@aven/protocol/types";

export function segmentsOf(
  request: ContextBreakdownSource,
  usedTokens: number,
): ContextSegment[] | undefined {
  if (usedTokens <= 0) return undefined;

  try {
    const whole: ContextBreakdownSource = {
      ...request,
      chatHistory: request.chatHistory ?? [],
      documents: request.documents ?? [],
      tools: request.tools ?? [],
      providerTools: request.providerTools ?? [],
    };
    const scaled = scaleContextBreakdown(estimateContextBreakdown(whole), usedTokens);
    const segments = scaled.segments.flatMap((segment) =>
      segment.tokens > 0 ? [{ id: segment.id, tokens: segment.tokens }] : [],
    );
    return segments.length > 0 ? segments : undefined;
  } catch {
    return undefined;
  }
}
