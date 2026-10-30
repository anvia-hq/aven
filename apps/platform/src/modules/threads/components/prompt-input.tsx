import { ArrowUp, Paperclip, Stop } from "@mynaui/icons-react";
import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Textarea } from "@/components/textarea";
import { toast } from "@/components/toast";

import { useAttachments } from "../hooks/use-attachments";
import { useModelSelection } from "../hooks/use-model-selection";
import type { AttachmentUpload, RunSelection } from "../types";
import { PendingAttachments } from "./attachment-list";
import { ModelMenu } from "./model-menu";

type Props = {
  // Resolves to whether the message was taken; the text and files are only cleared when it was.
  onSubmit: (
    prompt: string,
    selection: RunSelection,
    attachments: AttachmentUpload[],
  ) => boolean | Promise<boolean>;
  placeholder?: string;
  /** The agent is working: nothing can be sent, and Send gives way to Stop. */
  running?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
  /** The thread this composer replies in, whose own model choice it uses; none for a new thread. */
  threadId?: string;
};

export function PromptInput({
  onSubmit,
  placeholder = "Ask anything about the codebase…",
  running = false,
  onStop,
  autoFocus,
  threadId,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const model = useModelSelection(threadId);
  const attachments = useAttachments();
  const hasContent = value.trim().length > 0 || attachments.files.length > 0;
  const canSend = hasContent && !running && !sending;

  async function submit() {
    if (!canSend) return;
    setSending(true);
    try {
      const files = await attachments.encode();
      const sent = await onSubmit(value.trim(), model.selection, files);
      if (sent) {
        setValue("");
        attachments.clear();
      }
    } catch (error) {
      // A picked file can no longer be read, say it was moved; the message stays to send again.
      toast.add({
        title: "Could not read the attached files",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter while composing text with an input method confirms a candidate; it is not a send.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  // A pasted screenshot or file is attached; pasted text is left to the textarea.
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.files.length === 0) return;
    event.preventDefault();
    attachments.add(event.clipboardData.files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    setDragging(false);
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    attachments.add(event.dataTransfer.files);
  }

  return (
    <div
      className="flex flex-col rounded-lg border bg-card p-2 focus-within:border-ring data-[dragging]:border-ring data-[dragging]:bg-accent/40"
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <PendingAttachments files={attachments.files} onRemove={attachments.remove} />
      <Textarea
        aria-label="Prompt"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="min-h-14 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center gap-2 pt-2">
        <Input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) attachments.add(event.target.files);
            // Picking the same file again must still count as a change.
            event.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Attach files"
          title="Attach files: images are shown to the model, every file is copied into the sandbox"
          onClick={() => picker.current?.click()}
        >
          <Paperclip />
        </Button>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <ModelMenu model={model} />
          {running ? (
            <Button size="icon-sm" aria-label="Stop" onClick={onStop}>
              <Stop />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              aria-label="Send"
              disabled={!canSend}
              onClick={() => void submit()}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
