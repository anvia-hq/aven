import { ChevronDown, Rocket } from "@mynaui/icons-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/collapsible";
import { Markdown } from "@/components/markdown";

// What Ship sent the agent, as a card in the person's place in the thread: the steps are one click
// away, not a long message in the way.
export function ShipRequestCard({ prompt }: { prompt: string }) {
  return (
    <Collapsible
      className="ml-auto w-full max-w-[85%] rounded-lg border bg-card text-sm sm:max-w-md"
      data-role="user"
      defaultOpen={false}
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/50">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
          <Rocket className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Ship this thread</span>
          <span className="block truncate text-xs text-muted-foreground">
            Commit, push and open a pull request
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t px-3 py-3 text-muted-foreground">
          <Markdown>{prompt}</Markdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
