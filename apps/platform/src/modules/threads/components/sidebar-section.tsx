import { IconChevronDown } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { useLocalStorage } from "@aven/ui/use-local-storage";

type Props = {
  id: string;
  label: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  lazy?: boolean;
  children: ReactNode;
};

export function SidebarSection({
  id,
  label,
  collapsible = false,
  defaultOpen = true,
  lazy = false,
  children,
}: Props) {
  const [open, setOpen] = useLocalStorage(`aven.sidebar-group.${id}`, defaultOpen);

  if (!collapsible) {
    return (
      <section data-group={id} aria-label={label} className="pb-3">
        <h3 className="flex h-6 items-center px-2 text-[11px] font-medium text-muted-foreground/75">
          {label}
        </h3>
        {children}
      </section>
    );
  }

  return (
    <Collapsible
      render={<section data-group={id} aria-label={label} className="pb-3" />}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="flex h-6 items-center pl-2">
        <h3 className="flex min-w-0">
          <CollapsibleTrigger className="group/heading flex min-w-0 items-center gap-1.5 rounded-sm text-[11px] font-medium text-muted-foreground/75 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <span className="shrink-0">{label}</span>
            <IconChevronDown className="size-3 shrink-0 -rotate-90 transition-transform duration-200 group-data-panel-open/heading:rotate-0 motion-reduce:transition-none" />
          </CollapsibleTrigger>
        </h3>
      </div>
      {lazy && !open ? null : (
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none">
          {children}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
