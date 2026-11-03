import "@blocknote/shadcn/style.css";

import type { Block } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useRef } from "react";

import { useTheme } from "@/modules/theme/hooks/use-theme";

import { blocksOf } from "../rich-text";

export type RichTextEditorProps = {
  /** The body as it is kept: BlockNote's blocks as JSON, or text written before (decision 0105). */
  value: string;
  /** The body as it is now, as JSON, or empty when nothing is written. */
  onChange?: (value: string) => void;
  editable?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
};

// An empty document is one empty paragraph, which is kept as no body at all.
const isEmpty = (blocks: Block[]) =>
  blocks.length === 0 ||
  (blocks.length === 1 &&
    blocks[0]!.type === "paragraph" &&
    (blocks[0]!.content as unknown[] | undefined)?.length === 0 &&
    blocks[0]!.children.length === 0);

// The cockpit's editor (decision 0105): BlockNote, in the platform's theme. It is made once for the
// record it opens on: give it a `key` of the record's id so another record gets an editor of its own.
export default function RichTextEditorView({
  value,
  onChange,
  editable = true,
  placeholder = "Write, or press '/' for blocks",
  label,
  className,
}: RichTextEditorProps) {
  const { theme } = useTheme();
  const blocks = blocksOf(value);
  const editor = useCreateBlockNote({
    initialContent: blocks && blocks.length > 0 ? (blocks as Block[]) : undefined,
    dictionary: { ...en, placeholders: { ...en.placeholders, emptyDocument: placeholder } },
  });
  // Text written before the editor came is read in as markdown, once, without counting as a change.
  const loading = useRef(false);
  useEffect(() => {
    if (blocks || !value.trim()) return;
    loading.current = true;
    editor.replaceBlocks(editor.document, editor.tryParseMarkdownToBlocks(value));
    loading.current = false;
    // Only for the value the editor opened on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={theme === "light" ? "light" : "dark"}
      aria-label={label}
      className={className}
      onChange={() => {
        if (loading.current || !onChange) return;
        onChange(isEmpty(editor.document) ? "" : JSON.stringify(editor.document));
      }}
    />
  );
}
