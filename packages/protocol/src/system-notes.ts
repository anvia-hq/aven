const NOTE = /^\[(process|fork)\] ([^\n]+)/;

export function systemNoteOf(text: string): { kind: "process" | "fork"; line: string } | null {
  const found = NOTE.exec(text.trimStart());
  return found ? { kind: found[1] as "process" | "fork", line: found[2]!.trim() } : null;
}
