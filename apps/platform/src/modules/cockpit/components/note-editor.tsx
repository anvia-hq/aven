import { Calendar, Pin, Tag, Trash } from "@mynaui/icons-react";
import { useState } from "react";

import { cn } from "cn";

import { Button } from "@/components/button";
import { DropdownMenuItem } from "@/components/dropdown-menu";
import { timeAgo } from "@/lib/format";

import { useAutosave } from "../hooks/use-autosave";
import { useNotes } from "../hooks/use-notes";
import type { CockpitNote } from "../types";
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

export function NoteEditor({
  note,
  fresh,
  onClose,
}: {
  note: CockpitNote;
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
    <DocumentPage
      label={note.title}
      onBack={onClose}
      backLabel="Back to the notes"
      trail={
        <>
          <Crumb onClick={onClose}>Notes</Crumb>
          <CurrentCrumb>{title.trim() || "Untitled"}</CurrentCrumb>
        </>
      }
      actions={
        <>
          <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">
            Edited {timeAgo(note.updatedAt, true)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={note.pinned ? "Unpin" : "Pin"}
            aria-pressed={note.pinned}
            className={cn(note.pinned ? "text-foreground" : "text-muted-foreground")}
            onClick={() => void update(note, { pinned: !note.pinned })}
          >
            <Pin className={cn(note.pinned && "fill-current")} />
          </Button>
          <MoreMenu>
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                saveTitle.cancel();
                saveBody.cancel();

                if (await remove(note)) onClose();
              }}
            >
              <Trash /> Delete note
            </DropdownMenuItem>
          </MoreMenu>
        </>
      }
    >
      <DocumentTitle
        value={title}
        autoFocus={fresh}
        onChange={(value) => {
          setTitle(value);
          saveTitle.schedule(value);
        }}
        onCommit={() => {
          saveTitle.flush();

          if (!title.trim()) setTitle(note.title);
        }}
      />
      <Properties>
        <Property icon={Tag} label="Tags">
          <TagInput bare value={note.tags} onChange={(tags) => void update(note, { tags })} />
        </Property>
        <Property icon={Calendar} label="Created">
          <span className="px-1">{new Date(note.createdAt).toLocaleDateString()}</span>
        </Property>
      </Properties>
      <DocumentBody
        key={note.id}
        label="Note"
        value={note.body}
        placeholder="Write something, or press '/' for blocks"
        onChange={saveBody.schedule}
      />
    </DocumentPage>
  );
}
