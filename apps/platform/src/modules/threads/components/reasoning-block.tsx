import { cn } from "cn";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";

export function ReasoningBlock({ text, thinking = false }: { text: string; thinking?: boolean }) {
  return (
    <Collapsible className="min-w-0 text-sm" defaultOpen={false}>
      <CollapsibleTrigger className="group flex w-fit max-w-full items-center gap-2 py-1 text-left text-muted-foreground transition-colors hover:text-foreground">
        <span className={cn("text-muted-foreground", thinking && "shimmer")}>
          {thinking ? "Thinking" : "Thoughts"}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
        <p className="whitespace-pre-wrap pb-2 text-muted-foreground/80">{text}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
