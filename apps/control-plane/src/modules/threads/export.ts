import type { ChatMessage } from "@aven/protocol/types";

import { transcriptOf } from "./transcript";
import type { TranscriptEntry } from "./types";

function joinEntries(
  entries: readonly TranscriptEntry[],
  render: (entry: TranscriptEntry) => string,
) {
  let joined = "";

  entries.forEach((entry, index) => {
    const text = render(entry);

    if (index === 0) {
      joined = text;
      return;
    }

    const tight = entries[index - 1]?.kind === "bullet" && entry.kind === "bullet";
    joined = `${joined}${tight ? "\n" : "\n\n"}${text}`;
  });

  return joined;
}

function markdownEntry(entry: TranscriptEntry) {
  if (entry.kind === "heading") return `${"#".repeat(entry.level)} ${entry.text}`;

  if (entry.kind === "reasoning")
    return `<details>\n<summary>Reasoning</summary>\n\n${entry.text}\n</details>`;

  if (entry.kind === "bullet")
    return entry.code ? `- \`${entry.code}\` ${entry.text}` : `- ${entry.text}`;

  return entry.text;
}

function textEntry(entry: TranscriptEntry) {
  if (entry.kind === "reasoning") return `Reasoning:\n${entry.text}`;

  if (entry.kind === "bullet")
    return entry.code ? `- ${entry.code} ${entry.text}` : `- ${entry.text}`;

  return entry.text;
}

export function threadMarkdown(title: string, messages: readonly ChatMessage[]) {
  return `${joinEntries(transcriptOf(title, messages), markdownEntry)}\n`;
}

export function threadText(title: string, messages: readonly ChatMessage[]) {
  return `${joinEntries(transcriptOf(title, messages), textEntry)}\n`;
}
