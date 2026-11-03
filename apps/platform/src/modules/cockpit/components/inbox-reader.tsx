import { ArrowLeft, CheckCircle, InboxUp, Trash } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { timeAgo } from "@/lib/format";

import { useAutosave } from "../hooks/use-autosave";
import { useInbox } from "../hooks/use-inbox";
import type { InboxItem } from "../types";
import { RichTextEditor } from "./rich-text-editor";
import { TagInput } from "./tag-input";

// An inbox item opened beside the list, as a mail is (decision 0105): what to do with it above,
// then its title, tags and details, each saved as it is changed.
export function InboxReader({ item, onClose }: { item: InboxItem; onClose: () => void }) {
  const { update, remove } = useInbox();
  const [title, setTitle] = useState(item.title);
  const saveTitle = useAutosave((value: string) => {
    if (value.trim() && value.trim() !== item.title) void update(item, { title: value.trim() });
  });
  const saveBody = useAutosave((body: string) => void update(item, { body }));

  return (
    <article
      aria-label={item.title}
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 md:px-8"
    >
      <div className="flex items-center gap-1 border-b pb-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to the inbox"
          className="md:hidden"
          onClick={onClose}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="outline"
          size="sm"
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
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          onClick={async () => {
            if (await remove(item)) onClose();
          }}
        >
          <Trash /> Delete
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <Input
          aria-label="Title"
          value={title}
          maxLength={200}
          onChange={(event) => {
            setTitle(event.target.value);
            saveTitle.schedule(event.target.value);
          }}
          onBlur={saveTitle.flush}
          className="h-auto border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
        />
        <p className="text-xs text-muted-foreground">
          Captured {timeAgo(item.createdAt, true)}
          {item.done && " · Done"}
        </p>
      </div>
      <TagInput value={item.tags} onChange={(tags) => void update(item, { tags })} />
      <RichTextEditor
        key={item.id}
        label="Details"
        value={item.body}
        placeholder="Add details, or press '/' for blocks"
        onChange={saveBody.schedule}
        className="-mx-2 min-h-64"
      />
    </article>
  );
}
