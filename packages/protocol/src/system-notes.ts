const NOTE = /^\[(process|fork|continued|compaction)\] ([^\n]+)/;

export function systemNoteOf(
  text: string,
): { kind: "process" | "fork" | "continued" | "compaction"; line: string } | null {
  const found = NOTE.exec(text.trimStart());
  return found
    ? { kind: found[1] as "process" | "fork" | "continued" | "compaction", line: found[2]!.trim() }
    : null;
}
