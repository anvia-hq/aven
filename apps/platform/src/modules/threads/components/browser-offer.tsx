import { IconWorld } from "@tabler/icons-react";

import { Button } from "@aven/ui/button";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { useOfferPreview } from "@/modules/preview/hooks/use-preview-offer";
import { addressOf, parseAddress } from "@/modules/preview/port";

import type { ToolPart } from "../types";

export function BrowserOffer({
  tool,
  threadId,
  runtimeId,
}: {
  tool: ToolPart;
  threadId: string;
  runtimeId: string;
}) {
  const offer = useOfferPreview();
  const { config } = usePlatformConfig();
  const parsed = parseAddress(tool.target);

  if (parsed === null) return null;

  const address = addressOf(
    parsed.port,
    { runtimeId, previewDomain: config?.previewDomain ?? null },
    parsed.path,
  );

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
      <IconWorld className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        The agent is serving <span className="font-mono text-xs">{address}</span>
      </span>
      <Button size="sm" variant="outline" onClick={() => offer(threadId, parsed.port, parsed.path)}>
        Open in Browser
      </Button>
    </div>
  );
}
