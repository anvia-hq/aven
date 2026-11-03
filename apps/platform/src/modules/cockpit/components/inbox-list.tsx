import { Pencil, Trash } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { timeAgo } from "@/lib/format";

import { useInbox } from "../hooks/use-inbox";
import type { InboxItem } from "../types";
import { InboxItemDialog } from "./inbox-item-dialog";
import { TagList } from "./tag-list";

function InboxRow({ item }: { item: InboxItem }) {
  const { update, remove } = useInbox();
  const [editing, setEditing] = useState(false);
  return (
    <li className="group flex items-start gap-3 border-b px-1 py-3 last:border-b-0">
      <Checkbox
        aria-label={item.done ? `Open ${item.title} again` : `Mark ${item.title} done`}
        checked={item.done}
        onCheckedChange={(done) => void update(item, { done: Boolean(done) })}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={item.done ? "text-sm text-muted-foreground line-through" : "text-sm"}>
          {item.title}
        </span>
        {item.body && (
          <p className="line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">
            {item.body}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <TagList tags={item.tags} to="/cockpit/inbox" />
          <span className="text-xs text-muted-foreground">{timeAgo(item.createdAt, true)}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Edit ${item.title}`}
        onClick={() => setEditing(true)}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${item.title}`}
        onClick={() => void remove(item)}
      >
        <Trash />
      </Button>
      <InboxItemDialog item={item} open={editing} onOpenChange={setEditing} />
    </li>
  );
}

// The inbox's items: what is open, or what was dealt with.
export function InboxList({
  items,
  label,
  empty,
}: {
  items: InboxItem[];
  label: string;
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{empty}</p>
    );
  }
  return (
    <ul aria-label={label} className="flex flex-col">
      {items.map((item) => (
        <InboxRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
