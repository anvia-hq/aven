import { Calendar, CheckCircle, CircleDashed, InboxUp, Tag, Trash } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { DropdownMenuItem } from "@/components/dropdown-menu";
import { timeAgo } from "@/lib/format";

import { useAutosave } from "../hooks/use-autosave";
import { useInbox } from "../hooks/use-inbox";
import type { InboxItem } from "../types";
import {
  Crumb,
  CurrentCrumb,
  DocumentBody,
  DocumentPage,
  DocumentTitle,
  MoreMenu,
  Properties,
  Property,
} from "./document-page";
import { TagInput } from "./tag-input";

export function InboxReader({ item, onClose }: { item: InboxItem; onClose: () => void }) {
  const { update, remove } = useInbox();
  const [title, setTitle] = useState(item.title);
  const saveTitle = useAutosave((value: string) => {
    if (value.trim() && value.trim() !== item.title) void update(item, { title: value.trim() });
  });
  const saveBody = useAutosave((body: string) => void update(item, { body }));

  return (
    <DocumentPage
      label={item.title}
      onBack={onClose}
      backLabel="Back to the inbox"
      trail={
        <>
          <Crumb onClick={onClose}>Inbox</Crumb>
          <CurrentCrumb>{title.trim() || "Untitled"}</CurrentCrumb>
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              saveTitle.flush();
              saveBody.flush();
              void update(item, { done: !item.done });
            }}
          >
            {item.done ? (
              <>
                <InboxUp /> Move to inbox
              </>
            ) : (
              <>
                <CheckCircle /> Done
              </>
            )}
          </Button>
          <MoreMenu>
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                saveTitle.cancel();
                saveBody.cancel();
                if (await remove(item)) onClose();
              }}
            >
              <Trash /> Delete
            </DropdownMenuItem>
          </MoreMenu>
        </>
      }
    >
      <DocumentTitle
        value={title}
        onChange={(value) => {
          setTitle(value);
          saveTitle.schedule(value);
        }}
        onCommit={() => {
          saveTitle.flush();
          if (!title.trim()) setTitle(item.title);
        }}
      />
      <Properties>
        <Property icon={item.done ? CheckCircle : CircleDashed} label="Status">
          <span className="px-1">{item.done ? "Done" : "Open"}</span>
        </Property>
        <Property icon={Calendar} label="Captured">
          <span className="px-1">{timeAgo(item.createdAt, true)}</span>
        </Property>
        <Property icon={Tag} label="Tags">
          <TagInput bare value={item.tags} onChange={(tags) => void update(item, { tags })} />
        </Property>
      </Properties>
      <DocumentBody
        key={item.id}
        label="Details"
        value={item.body}
        placeholder="Add details, or press '/' for blocks"
        onChange={saveBody.schedule}
      />
    </DocumentPage>
  );
}
