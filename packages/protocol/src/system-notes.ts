// A message the control plane sends an agent for something that happened, not something the person
// said: a fork that ended, a process that ended (decisions 0142 and 0144). Its first line is the
// whole story for a person; the rest is for the agent.
const NOTE = /^\[(process|fork)\] ([^\n]+)/;

export function systemNoteOf(text: string): { kind: "process" | "fork"; line: string } | null {
  const found = NOTE.exec(text.trimStart());
  return found ? { kind: found[1] as "process" | "fork", line: found[2]!.trim() } : null;
}
