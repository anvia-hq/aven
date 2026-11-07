import type { OutgoingMessage, RunSelection } from "./types";

export function messageBody(
  { prompt, attachments, mentions }: OutgoingMessage,
  selection: RunSelection,
) {
  const body: Record<string, unknown> = { prompt, ...selection };
  if (attachments.length > 0) body.attachments = attachments;
  if (mentions.length > 0) body.mentions = mentions;
  return body;
}
