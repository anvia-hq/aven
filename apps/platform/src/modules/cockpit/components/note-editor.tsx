import { ArrowLeft, Pin, Trash } from "@mynaui/icons-react";
import { useState } from "react";

import { cn } from "cn";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { timeAgo } from "@/lib/format";

import { useAutosave } from "../hooks/use-autosave";
import { useNotes } from "../hooks/use-notes";
import type { CockpitNote } from "../types";
import { RichTextEditor } from "./rich-text-editor";
import { TagInput } from "./tag-input";

// A note open beside the list, as a page (decision 0105): its title and tags above, then the
// document in BlockNote, each saved as it is written.
export function NoteEditor({
  note,
  fresh,
  onClose,
}: {
  note: CockpitNote;
  /** Just made: its title is chosen, ready to be typed over. */
  fresh: boolean;
  onClose: () => void;
}) {
  const { update, remove } = useNotes();
  const [title, setTitle] = useState(note.title);
  const saveTitle = useAutosave((value: string) => {
    if (value.trim() && value.trim() !== note.title) void update(note, { title: value.trim() });
  });
  const saveBody = useAutosave((body: string) => void update(note, { body }));

  return (
    <article
      aria-label={note.title}
      className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4 md:px-8"
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to the notes"
          className="md:hidden"
          onClick={onClose}
        >
          <ArrowLeft />
        </Button>
        <span className="text-xs text-muted-foreground">
          Edited {timeAgo(note.updatedAt, true)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={note.pinned ? "Unpin" : "Pin"}
          aria-pressed={note.pinned}
          className={cn("ml-auto", note.pinned ? "text-primary" : "text-muted-foreground")}
          onClick={() => void update(note, { pinned: !note.pinned })}
        >
          <Pin />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete note"
          className="text-muted-foreground"
          onClick={async () => {
            if (await remove(note)) onClose();
          }}
        >
          <Trash />
        </Button>
      </div>
      <Input
        aria-label="Title"
        value={title}
        maxLength={200}
        autoFocus={fresh}
        onFocus={(event) => fresh && event.currentTarget.select()}
        onChange={(event) => {
          setTitle(event.target.value);
          saveTitle.schedule(event.target.value);
        }}
        onBlur={saveTitle.flush}
        className="h-auto border-0 px-0 text-2xl font-bold shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent"
      />
      <TagInput value={note.tags} onChange={(tags) => void update(note, { tags })} />
      <RichTextEditor
        key={note.id}
        label="Note"
        value={note.body}
        onChange={saveBody.schedule}
        className="-mx-2 min-h-[60vh]"
      />
    </article>
  );
}
