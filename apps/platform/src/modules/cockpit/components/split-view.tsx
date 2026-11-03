import type { ComponentType, ReactNode } from "react";

import { cn } from "cn";

// A list beside what is open in it, as a mail app has them (decisions 0105 and 0106): each scrolls
// by itself. On a narrow screen only one shows, the open one when there is one.
export function SplitView({
  list,
  detail,
  open,
}: {
  list: ReactNode;
  detail: ReactNode;
  /** Whether something is open, which a narrow screen shows instead of the list. */
  open: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-r border-border/60 md:w-80 md:shrink-0 lg:w-96",
          open && "hidden md:flex",
        )}
      >
        {list}
      </aside>
      <section
        className={cn("min-w-0 flex-1 flex-col overflow-y-auto", open ? "flex" : "hidden md:flex")}
      >
        {detail}
      </section>
    </div>
  );
}

// What the open side says with nothing open: a quiet word in the middle.
export function NothingOpen({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
      <Icon className="size-8 text-muted-foreground/40" />
      {children}
    </div>
  );
}
