import { IconTag } from "@tabler/icons-react";
import { useBlocker } from "@tanstack/react-router";
import { useRef, useState, type KeyboardEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@aven/ui/alert-dialog";
import { Button } from "@aven/ui/button";

import { useInbox } from "../hooks/use-inbox";
import {
  Crumb,
  CurrentCrumb,
  DocumentBody,
  DocumentPage,
  DocumentTitle,
  Properties,
  Property,
} from "./document-page";
import { TagInput } from "./tag-input";

export function InboxDraft({
  tag,
  onAdded,
  onCancel,
}: {
  tag?: string;
  onAdded: (id: string) => void;
  onCancel: () => void;
}) {
  const { capture } = useInbox();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>(tag ? [tag] : []);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = title.trim() !== "" && !busy;
  const settled = useRef(false);
  const written = title.trim() !== "" || body !== "";
  const blocker = useBlocker({
    shouldBlockFn: () => written && !settled.current,
    enableBeforeUnload: () => written && !settled.current,
    withResolver: true,
  });
  const cancel = () => {
    settled.current = true;
    onCancel();
  };

  async function add() {
    if (!ready) return;

    setBusy(true);
    try {
      settled.current = true;
      const made = await capture({ title: title.trim(), body, tags });

      if (made) onAdded(made.id);
      else settled.current = false;
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void add();
    }
  }

  return (
    <DocumentPage
      label="New item"
      onBack={cancel}
      backLabel="Back to the inbox"
      trail={
        <>
          <Crumb onClick={cancel}>Inbox</Crumb>
          <CurrentCrumb>New</CurrentCrumb>
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} onClick={() => void add()}>
            Add to inbox
          </Button>
        </>
      }
    >
      <div onKeyDown={onKeyDown}>
        <DocumentTitle value={title} autoFocus onChange={setTitle} onCommit={() => {}} />
        <Properties>
          <Property icon={IconTag} label="Tags">
            <TagInput bare value={tags} onChange={setTags} />
          </Property>
        </Properties>
        <DocumentBody
          key="new"
          label="Details"
          value=""
          placeholder="Add details, or press '/' for blocks"
          onChange={setBody}
        />
      </div>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(next) => {
          if (!next) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this new item?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved draft will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                settled.current = true;
                blocker.proceed?.();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DocumentPage>
  );
}
