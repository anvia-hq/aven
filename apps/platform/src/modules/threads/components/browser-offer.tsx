import { IconWorld } from "@tabler/icons-react";

import { Button } from "@aven/ui/button";
import { useOfferPreview } from "@/modules/preview/hooks/use-preview-offer";
import { addressOf, parsePort } from "@/modules/preview/port";

import type { ToolPart } from "../types";

export function BrowserOffer({ tool, threadId }: { tool: ToolPart; threadId: string }) {
  const offer = useOfferPreview();
  const port = parsePort(tool.target);

  if (port === null) return null;

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
      <IconWorld className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        The agent is serving <span className="font-mono text-xs">{addressOf(port)}</span>
      </span>
      <Button size="sm" variant="outline" onClick={() => offer(threadId, port)}>
        Open in Browser
      </Button>
    </div>
  );
}
