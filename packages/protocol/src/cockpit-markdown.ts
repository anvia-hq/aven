// A cockpit body as markdown, for an agent to read (decision 0109). A body is BlockNote's blocks
// as JSON, or markdown an agent or an earlier version wrote, which is already what is wanted.

type Styles = { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean };
type Inline = { type?: string; text?: string; href?: string; styles?: Styles; content?: unknown };
type Block = {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: unknown;
};

const isBlock = (value: unknown): value is Block =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Block).type === "string" &&
  Array.isArray((value as Block).children);

function styled(text: string, styles: Styles = {}) {
  if (!text) return text;
  if (styles.code) return `\`${text}\``;
  let out = text;
  if (styles.bold) out = `**${out}**`;
  if (styles.italic) out = `*${out}*`;
  if (styles.strike) out = `~~${out}~~`;
  return out;
}

function inline(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: Inline | string) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      if (part.type === "link") return `[${inline(part.content)}](${part.href ?? ""})`;
      if (typeof part.text === "string") return styled(part.text, part.styles);
      return inline(part.content);
    })
    .join("");
}

// A table's rows, the first as its header.
function table(content: unknown) {
  const rows = (content as { rows?: { cells?: unknown[] }[] } | null)?.rows ?? [];
  const cell = (value: unknown) =>
    inline(Array.isArray(value) ? value : (value as Inline | null)?.content).replace(/\|/g, "\\|");
  const lines = rows.map((row) => `| ${(row.cells ?? []).map(cell).join(" | ")} |`);
  if (lines.length === 0) return "";
  const width = rows[0]?.cells?.length ?? 1;
  lines.splice(1, 0, `|${" --- |".repeat(width)}`);
  return lines.join("\n");
}

function blocks(list: Block[], depth: number): string[] {
  const indent = "  ".repeat(depth);
  let number = 0;
  return list.flatMap((block) => {
    const text = inline(block.content);
    const props = block.props ?? {};
    number = block.type === "numberedListItem" ? number + 1 : 0;
    let line: string;
    switch (block.type) {
      case "heading":
        line = `${"#".repeat(Math.min(Number(props.level) || 1, 6))} ${text}`;
        break;
      case "bulletListItem":
        line = `- ${text}`;
        break;
      case "numberedListItem":
        line = `${number}. ${text}`;
        break;
      case "checkListItem":
        line = `- [${props.checked ? "x" : " "}] ${text}`;
        break;
      case "quote":
        line = `> ${text}`;
        break;
      case "codeBlock":
        line = `\`\`\`${typeof props.language === "string" ? props.language : ""}\n${text}\n\`\`\``;
        break;
      case "table":
        line = table(block.content);
        break;
      case "image":
      case "video":
      case "audio":
      case "file":
        line = props.url ? `[${props.name || block.type}](${String(props.url)})` : "";
        break;
      default:
        line = text;
    }
    const children = Array.isArray(block.children)
      ? blocks(block.children.filter(isBlock), depth + 1)
      : [];
    return [`${indent}${line}`, ...children];
  });
}

/** A body as markdown: BlockNote's blocks written out, or a body that is text as it is. */
export function cockpitMarkdown(body: string): string {
  if (!body.trimStart().startsWith("[")) return body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isBlock)) return body;
  return blocks(parsed, 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
