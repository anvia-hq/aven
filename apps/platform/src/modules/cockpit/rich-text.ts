import { isBlockDocument } from "@aven/protocol/cockpit-markdown";

type InlineLike = { text?: unknown; content?: unknown };
type BlockLike = { content?: unknown; children?: unknown };

export function blocksOf(body: string): unknown[] | null {
  if (!body.trimStart().startsWith("[")) return null;

  try {
    const parsed: unknown = JSON.parse(body);
    return isBlockDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function partText(part: InlineLike | string): string {
  if (typeof part === "string") return part;

  if (typeof part !== "object" || part === null) return "";

  if (typeof part.text === "string") return part.text;

  return inlineText(part.content);
}

function inlineText(content: unknown): string {
  if (typeof content === "string") return content;

  if (!Array.isArray(content)) {
    const rows = (content as { rows?: { cells?: unknown[] }[] } | null)?.rows;
    const cellText = (cell: unknown) =>
      inlineText(Array.isArray(cell) ? cell : (cell as InlineLike | null)?.content);
    return rows ? rows.flatMap((row) => (row.cells ?? []).map(cellText)).join(" ") : "";
  }

  return content.map(partText).join("");
}

function blockLines(blocks: unknown[]): string[] {
  return blocks.flatMap((block) => {
    const { content, children } = (block ?? {}) as BlockLike;
    const line = inlineText(content).trim();
    const nested = Array.isArray(children) ? blockLines(children) : [];
    return line ? [line, ...nested] : nested;
  });
}

export function plainTextOf(body: string) {
  const blocks = blocksOf(body);
  const text = blocks
    ? blockLines(blocks).join(" ")
    : body.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`~[\]]+/g, " ");
  return text.replace(/\s+/g, " ").trim();
}
