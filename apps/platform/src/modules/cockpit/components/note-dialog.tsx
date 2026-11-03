import { Plus, Trash } from "@mynaui/icons-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { Field, FieldLabel } from "@/components/field";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Markdown } from "@/components/markdown";
import { Switch } from "@/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import { Textarea } from "@/components/textarea";

import { useNotes } from "../hooks/use-notes";
import type { CockpitNote } from "../types";
import { TagInput } from "./tag-input";

function NoteForm({ note, tag, onDone }: { note?: CockpitNote; tag?: string; onDone: () => void }) {
  const { create, update, remove } = useNotes();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tags, setTags] = useState<string[]>(note?.tags ?? (tag ? [tag] : []));
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { title: title.trim(), body, tags, pinned };
    setBusy(true);
    try {
      const saved = note ? await update(note, input) : await create(input);
      if (saved) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={onSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{note ? "Edit note" : "New note"}</DialogTitle>
      </DialogHeader>
      <Input
        aria-label="Title"
        required
        autoFocus
        maxLength={200}
        value={title}
        placeholder="Title"
        onChange={(event) => setTitle(event.target.value)}
        className="text-base font-medium"
      />
      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write">
          <Textarea
            aria-label="Note"
            value={body}
            placeholder="Markdown welcome."
            onChange={(event) => setBody(event.target.value)}
            className="max-h-[50vh] min-h-56 font-mono text-xs"
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="max-h-[50vh] min-h-56 overflow-y-auto rounded-lg border p-3">
            {body.trim() ? (
              <Markdown>{body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to preview.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <Field>
        <FieldLabel>Tags</FieldLabel>
        <TagInput value={tags} onChange={setTags} />
      </Field>
      <Field orientation="horizontal">
        <Switch
          size="sm"
          aria-label="Pin to the top"
          checked={pinned}
          onCheckedChange={setPinned}
        />
        <FieldLabel>Pin to the top</FieldLabel>
      </Field>
      <DialogFooter className="sm:justify-between">
        {note ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            // Closed only once it is gone: a failure keeps the form, and says why.
            onClick={async () => {
              if (await remove(note)) onDone();
            }}
          >
            <Trash /> Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={busy || !title.trim()}>
          {note ? "Save" : "Create note"}
        </Button>
      </DialogFooter>
    </Form>
  );
}

// The button that starts a note, and its editor.
export function NewNoteDialog({ tag }: { tag?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus /> New note
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        {open && <NoteForm tag={tag} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

// The editor for a note there already, opened from its card.
export function EditNoteDialog({
  note,
  onOpenChange,
}: {
  note: CockpitNote | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={note !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {note && <NoteForm note={note} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
