import { Plus } from "@mynaui/icons-react";
import { cn } from "cn";

import { Button } from "@/components/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { shortTimeAgo } from "@/lib/format";

import { plainTextOf } from "../rich-text";
import type { InboxItem } from "../types";
import { TagBadge } from "./tag-badge";

export type InboxShown = "open" | "done";

function InboxRow({
  item,
  selected,
  onSelect,
}: {
  item: InboxItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const preview = plainTextOf(item.body);
  return (
    <li>
      <Button
        variant="ghost"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "h-auto w-full flex-col items-stretch gap-0.5 rounded-md px-2.5 py-2 text-left font-normal whitespace-normal hover:bg-muted/60",
          selected && "bg-muted hover:bg-muted",
        )}
      >
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              item.done ? "text-muted-foreground" : "font-medium",
            )}
          >
            {item.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {shortTimeAgo(item.createdAt)}
          </span>
        </span>
        {(preview || item.tags.length > 0) && (
          <span className="flex min-w-0 gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{preview}</span>
            {item.tags.length > 0 && (
              <span className="flex shrink-0 gap-1">
                {item.tags.slice(0, 2).map((tag) => (
                  <TagBadge key={tag} tag={tag} className="h-4 px-1.5 text-[0.6875rem]" />
                ))}
              </span>
            )}
          </span>
        )}
      </Button>
    </li>
  );
}

// The inbox's list, as a mail app's (decisions 0105 and 0106): Open or Done, + for a new item,
// and each item as a quiet row of its title, when it came and the start of its details.
export function InboxPane({
  items,
  shown,
  tag,
  selected,
  creating,
  onShow,
  onSelect,
  onNew,
}: {
  items: InboxItem[];
  shown: InboxShown;
  tag?: string;
  selected?: string;
  /** A new item is open, not yet kept. */
  creating: boolean;
  onShow: (shown: InboxShown) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const listed = items.filter((item) => item.done === (shown === "done"));
  const open = items.filter((item) => !item.done).length;

  return (
    <>
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="flex-1 text-sm font-semibold">Inbox{tag && ` · #${tag}`}</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New item"
          aria-current={creating ? "true" : undefined}
          className="text-muted-foreground"
          onClick={onNew}
        >
          <Plus />
        </Button>
        <Tabs value={shown} onValueChange={(value) => onShow(value === "done" ? "done" : "open")}>
          <TabsList variant="line" aria-label="Show" className="h-7">
            <TabsTrigger value="open" className="text-xs">
              Open{open > 0 && <span className="text-muted-foreground">{open}</span>}
            </TabsTrigger>
            <TabsTrigger value="done" className="text-xs">
              Done
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      {listed.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {shown === "open"
            ? "Nothing in your inbox. Add whatever comes to mind with +."
            : "Nothing done yet."}
        </p>
      ) : (
        <ul
          aria-label={shown === "open" ? "Open items" : "Done items"}
          className="flex flex-1 flex-col gap-px overflow-y-auto px-2 pb-4"
        >
          {listed.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              selected={item.id === selected}
              onSelect={() => onSelect(item.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
