const NOTE = /^\[(process|fork|continued)\] ([^\n]+)/;

export function systemNoteOf(
  text: string,
): { kind: "process" | "fork" | "continued"; line: string } | null {
  const found = NOTE.exec(text.trimStart());
  return found
    ? { kind: found[1] as "process" | "fork" | "continued", line: found[2]!.trim() }
    : null;
}
