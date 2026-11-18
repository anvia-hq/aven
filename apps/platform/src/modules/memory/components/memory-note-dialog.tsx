import { Plus } from "@mynaui/icons-react";
import { MEMORY_NOTE_MAX } from "@aven/protocol/memory";
import { useState, type FormEvent } from "react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aven/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@aven/ui/field";
import { Form } from "@aven/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aven/ui/select";
import { Textarea } from "@aven/ui/textarea";
import { TextField } from "@aven/ui/text-field";

import { useMemory } from "../hooks/use-memory";
import type { FolderChoice, MemoryNote } from "../types";

const NAME_PATTERN = "[a-z0-9][a-z0-9._\\-]{0,78}\\.md";

function NoteForm({
  note,
  folders,
  onDone,
}: {
  note?: MemoryNote;
  folders: FolderChoice[];
  onDone: () => void;
}) {
  const { create, update } = useMemory();
  const [folderKey, setFolderKey] = useState(folders[0]?.key ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { name: String(form.get("name")).trim(), body: String(form.get("body")) };
    const chosen = folders.find((choice) => choice.key === folderKey)?.folder;
    setBusy(true);
    try {
      let saved = false;

      if (note) saved = await update(note, input);
      else if (chosen) saved = await create(chosen, input);

      if (saved) onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{note ? `Edit ${note.name}` : "Add a note"}</DialogTitle>
        <DialogDescription>
          One fact your agents should know in later conversations. Start it with a description line,
          as your agents do, so they can tell when it matters.
        </DialogDescription>
      </DialogHeader>
      {!note && (
        <Field>
          <FieldLabel>Folder</FieldLabel>
          <Select value={folderKey} onValueChange={(value) => setFolderKey(String(value))}>
            <SelectTrigger aria-label="Folder" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {folders.map((choice) => (
                <SelectItem key={choice.key} value={choice.key}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <TextField
        label="Name"
        name="name"
        required
        defaultValue={note?.name}
        placeholder="prefers-small-commits.md"
        pattern={NAME_PATTERN}
        title="Lowercase letters, digits, '.', '_' and '-', ending in .md"
      />
      <Field>
        <FieldLabel>Note</FieldLabel>
        <Textarea
          name="body"
          aria-label="Note"
          required
          maxLength={MEMORY_NOTE_MAX}
          defaultValue={note?.body ?? "---\ndescription: \ntype: user\n---\n"}
          className="max-h-96 min-h-40 font-mono text-xs"
        />
        <FieldDescription>
          Type is user, feedback, project or reference. Never put a secret in a note.
        </FieldDescription>
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {note ? "Save changes" : "Add note"}
        </Button>
      </DialogFooter>
    </Form>
  );
}

export function AddNoteDialog({ folders }: { folders: FolderChoice[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus /> Add note
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <NoteForm folders={folders} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function EditNoteDialog({
  note,
  open,
  onOpenChange,
}: {
  note: MemoryNote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <NoteForm note={note} folders={[]} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
