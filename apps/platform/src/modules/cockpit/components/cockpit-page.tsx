import { X } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "cn";

import { Badge } from "@/components/badge";

type Props = {
  title: string;
  /** The tag the page shows only what carries, if one. */
  tag?: string;
  to: "/cockpit/inbox" | "/cockpit/tasks" | "/cockpit/notes";
  actions?: ReactNode;
  /** Wider for the board, which needs the room. */
  wide?: boolean;
  children: ReactNode;
};

// A page of the cockpit: its title, the tag it is filtered by with a way to clear it, its actions.
export function CockpitPage({ title, tag, to, actions, wide = false, children }: Props) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-4 px-4 py-6 md:py-10",
        wide ? "max-w-7xl" : "max-w-4xl",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {tag && (
            <Badge
              variant="secondary"
              render={
                <Link
                  to={to}
                  search={(prev: Record<string, unknown>) => ({ ...prev, tag: undefined })}
                />
              }
              aria-label={`Clear the tag ${tag}`}
            >
              #{tag}
              <X />
            </Badge>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** What carries `tag`, or everything without one. */
export const withTag = <T extends { tags: string[] }>(items: T[], tag?: string) =>
  tag ? items.filter((item) => item.tags.includes(tag)) : items;
