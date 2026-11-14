import { cn } from "cn";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";

export function ReasoningBlock({ text, thinking = false }: { text: string; thinking?: boolean }) {
  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/50">
        <span className={cn("text-muted-foreground", thinking && "shimmer")}>
          {thinking ? "Thinking" : "Thoughts"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="whitespace-pre-wrap px-2 pb-2 text-muted-foreground/80">{text}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
