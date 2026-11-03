import type { ReactNode } from "react";

import { cn } from "cn";

// A list beside what is open in it, as a mail app has them (decision 0105): each scrolls by itself.
// On a narrow screen only one shows, the open one when there is one.
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
          "flex w-full min-w-0 flex-col border-r md:w-80 md:shrink-0 lg:w-96",
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

// The head of the list pane: its title, what filters it, its actions.
export function PaneHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2 border-b px-3 pt-4 pb-3">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      {children}
    </header>
  );
}

// What the detail pane says with nothing open.
export function NothingOpen({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
