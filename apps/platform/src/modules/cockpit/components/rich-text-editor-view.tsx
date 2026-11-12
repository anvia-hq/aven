import "@blocknote/shadcn/style.css";

import type { Block } from "@blocknote/core";
import { SuggestionMenu } from "@blocknote/core/extensions";
import { en } from "@blocknote/core/locales";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useRef } from "react";

import { useTheme } from "@/modules/theme/hooks/use-theme";

import { blocksOf } from "../rich-text";

export type RichTextEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
};

const isEmpty = (blocks: Block[]) =>
  blocks.length === 0 ||
  (blocks.length === 1 &&
    blocks[0]!.type === "paragraph" &&
    (blocks[0]!.content as unknown[] | undefined)?.length === 0 &&
    blocks[0]!.children.length === 0);

export default function RichTextEditorView({
  value,
  onChange,
  editable = true,
  placeholder = "Write, or press '/' for blocks",
  label,
  className,
}: RichTextEditorProps) {
  const { resolvedTheme } = useTheme();
  const blocks = blocksOf(value);
  const editor = useCreateBlockNote({
    initialContent: blocks && blocks.length > 0 ? (blocks as Block[]) : undefined,
    dictionary: { ...en, placeholders: { ...en.placeholders, emptyDocument: placeholder } },
    domAttributes: { editor: { "aria-label": label } },
  });
  const loading = useRef(false);
  useEffect(() => {
    if (blocks || !value.trim()) return;
    loading.current = true;
    editor.replaceBlocks(editor.document, editor.tryParseMarkdownToBlocks(value));
    loading.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const menu = editor.getExtension(SuggestionMenu);
      if (event.key !== "Escape" || !menu?.shown()) return;
      event.stopPropagation();
      event.preventDefault();
      menu.closeMenu();
    };
    element.addEventListener("keydown", onKeyDown, { capture: true });
    return () => element.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [editor]);

  return (
    <div ref={frame} className="contents">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={resolvedTheme}
        className={className}
        onChange={() => {
          if (loading.current || !onChange) return;
          onChange(isEmpty(editor.document) ? "" : JSON.stringify(editor.document));
        }}
      />
    </div>
  );
}
