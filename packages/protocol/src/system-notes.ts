// A message the control plane sends an agent for something that happened, not something the person
// said: a fork that ended, a process that ended, a thread continued on another runner (decisions 0142, 0144 and 0149). Its first line is the
// whole story for a person; the rest is for the agent.
const NOTE = /^\[(process|fork|continued)\] ([^\n]+)/;

export function systemNoteOf(
  text: string,
): { kind: "process" | "fork" | "continued"; line: string } | null {
  const found = NOTE.exec(text.trimStart());
  return found
    ? { kind: found[1] as "process" | "fork" | "continued", line: found[2]!.trim() }
    : null;
}
