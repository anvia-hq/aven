import { IconChevronRight } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { useLocalStorage } from "@aven/ui/use-local-storage";

export function OverviewCard({
  title,
  summary,
  aside,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary?: ReactNode;
  aside?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useLocalStorage(
    `aven.overview.card.${title.toLowerCase().replace(/\s+/g, "-")}`,
    defaultOpen,
  );

  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-card/40 p-3.5 text-sm"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger className="group -mx-1 -my-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <IconChevronRight
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ease-out group-hover:text-foreground group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
            />
            <h2 className="shrink-0 text-xs leading-4 font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              {title}
            </h2>
            {!open && summary && (
              <span className="ml-auto min-w-0 truncate text-xs leading-4 text-muted-foreground tabular-nums">
                {summary}
              </span>
            )}
          </CollapsibleTrigger>
          {aside && (open || !summary) ? aside : null}
        </div>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="flex min-w-0 flex-col gap-2 pt-2">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
