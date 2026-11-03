// A cockpit body as BlockNote keeps it (decision 0105): the editor's blocks as JSON, or, for one
// written before, plain text or markdown, which the editor reads in on open.

type InlineLike = { text?: unknown; content?: unknown };
type BlockLike = { content?: unknown; children?: unknown };

/** The blocks of a body, or null for one that is text (or empty). */
export function blocksOf(body: string): unknown[] | null {
  if (!body.trimStart().startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// A piece of inline content: text, a link (whose content is text) or a mention of some kind.
function partText(part: InlineLike | string): string {
  if (typeof part === "string") return part;
  if (typeof part.text === "string") return part.text;
  return inlineText(part.content);
}

function inlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    // A table's content is rows of cells.
    const rows = (content as { rows?: { cells?: unknown[] }[] } | null)?.rows;
    return rows ? rows.flatMap((row) => (row.cells ?? []).map(inlineText)).join(" ") : "";
  }
  return content.map(partText).join("");
}

function blockLines(blocks: unknown[]): string[] {
  return blocks.flatMap((block) => {
    const { content, children } = block as BlockLike;
    const line = inlineText(content).trim();
    const nested = Array.isArray(children) ? blockLines(children) : [];
    return line ? [line, ...nested] : nested;
  });
}

/** The words of a body on one line, for a list's preview: no markup, no structure. */
export function plainTextOf(body: string) {
  const blocks = blocksOf(body);
  const text = blocks
    ? blockLines(blocks).join(" ")
    : body.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`~[\]]+/g, " ");
  return text.replace(/\s+/g, " ").trim();
}
