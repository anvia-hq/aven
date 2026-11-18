import type { ChatMessage, MessageAttachment, MessagePart } from "@aven/protocol/types";

type Block = { text: string; bullet: boolean };

const prose = (text: string): Block => ({ text, bullet: false });
const bullet = (text: string): Block => ({ text, bullet: true });

function partBlock(part: MessagePart): Block | null {
  if (part.type === "text") {
    const text = part.text.trim();
    return text.length > 0 ? prose(text) : null;
  }

  if (part.type === "reasoning") {
    const text = part.text.trim();
    return text.length > 0
      ? prose(`<details>\n<summary>Reasoning</summary>\n\n${text}\n</details>`)
      : null;
  }

  return bullet(`\`${part.tool.name}\` ${part.tool.target} (${part.tool.status})`);
}

function attachmentBlock(attachment: MessageAttachment) {
  return bullet(`Attached: ${attachment.name} (${attachment.mediaType})`);
}

function joinBlocks(blocks: readonly Block[]) {
  let joined = "";

  blocks.forEach((block, index) => {
    const text = block.bullet ? `- ${block.text}` : block.text;

    if (index === 0) {
      joined = text;
      return;
    }

    const tight = blocks[index - 1]?.bullet === true && block.bullet;
    joined = `${joined}${tight ? "\n" : "\n\n"}${text}`;
  });

  return joined;
}

function messageBlock(message: ChatMessage): Block | null {
  const blocks = message.parts.flatMap((part) => partBlock(part) ?? []);

  for (const attachment of message.attachments ?? []) blocks.push(attachmentBlock(attachment));

  if (blocks.length === 0) return null;

  return prose(`${message.role === "user" ? "## User" : "## Assistant"}\n\n${joinBlocks(blocks)}`);
}

export function threadMarkdown(title: string, messages: readonly ChatMessage[]) {
  const blocks = messages.flatMap((message) => messageBlock(message) ?? []);
  return `${[`# ${title}`, ...blocks.map((block) => block.text)].join("\n\n")}\n`;
}
