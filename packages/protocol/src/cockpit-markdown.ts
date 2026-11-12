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

function fence(text: string, least: number) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(least, longest + 1));
}

function styled(text: string, styles: Styles = {}) {
  if (!text) return text;

  if (styles.code) {
    const ticks = fence(text, 1);
    const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
    return `${ticks}${pad}${text}${pad}${ticks}`;
  }

  const [, lead = "", core = "", trail = ""] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];

  if (!core) return text;

  let out = core;

  if (styles.bold) out = `**${out}**`;

  if (styles.italic) out = `*${out}*`;

  if (styles.strike) out = `~~${out}~~`;

  return `${lead}${out}${trail}`;
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

function table(content: unknown) {
  const rows = (content as { rows?: { cells?: unknown[] }[] } | null)?.rows ?? [];
  const cell = (value: unknown) =>
    inline(Array.isArray(value) ? value : (value as Inline | null)?.content)
      .replace(/\s*\n\s*/g, " ")
      .replace(/\|/g, "\\|");
  const lines = rows.map((row) => `| ${(row.cells ?? []).map(cell).join(" | ")} |`);

  if (lines.length === 0) return "";

  const width = rows[0]?.cells?.length ?? 1;
  lines.splice(1, 0, `|${" --- |".repeat(width)}`);
  return lines.join("\n");
}

const LIST_ITEMS = new Set(["bulletListItem", "numberedListItem", "checkListItem"]);

const indent = (text: string, width: number) =>
  text
    .split("\n")
    .map((line) => (line ? `${" ".repeat(width)}${line}` : line))
    .join("\n");

function block(item: Block, number: number): string {
  const text = inline(item.content);
  const props = item.props ?? {};
  let marker = "";
  let line: string;
  switch (item.type) {
    case "heading":
      line = `${"#".repeat(Math.min(Number(props.level) || 1, 6))} ${text}`;
      break;
    case "bulletListItem":
      marker = "- ";
      line = text;
      break;
    case "numberedListItem":
      marker = `${number}. `;
      line = text;
      break;
    case "checkListItem":
      marker = `- [${props.checked ? "x" : " "}] `;
      line = text;
      break;
    case "quote":
      line = text
        .split("\n")
        .map((each) => `> ${each}`)
        .join("\n");
      break;
    case "codeBlock": {
      const ticks = fence(text, 3);
      const language = typeof props.language === "string" ? props.language : "";
      line = `${ticks}${language}\n${text}\n${ticks}`;
      break;
    }
    case "table":
      line = table(item.content);
      break;
    case "divider":
      line = "---";
      break;
    case "image":
    case "video":
    case "audio":
    case "file":
      line = props.url ? `[${String(props.name || item.type)}](${String(props.url)})` : "";
      break;
    default:
      line = text;
  }
  const children = Array.isArray(item.children) ? blocks(item.children.filter(isBlock)) : "";
  const head = marker ? `${marker}${indent(line, marker.length).trimStart()}` : line;

  if (!children) return head;

  const under = indent(children, marker.length);
  return head ? `${head}\n${marker ? "" : "\n"}${under}` : under;
}

function blocks(list: Block[]): string {
  let out = "";
  let previous: string | undefined;
  let number = 0;
  for (const item of list) {
    if (item.type === "numberedListItem") {
      const start = Number(item.props?.start);
      const first = Number.isFinite(start) && start > 0 ? start : 1;
      number = previous === "numberedListItem" ? number + 1 : first;
    }

    const text = block(item, number);

    if (!text.trim()) {
      previous = item.type;
      continue;
    }

    const tight =
      previous !== undefined && LIST_ITEMS.has(previous) && LIST_ITEMS.has(item.type ?? "");
    out += out ? (tight ? "\n" : "\n\n") + text : text;
    previous = item.type;
  }
  return out;
}

export function isBlockDocument(parsed: unknown): parsed is unknown[] {
  return Array.isArray(parsed) && parsed.length > 0 && parsed.every(isBlock);
}

export function cockpitMarkdown(body: string): string {
  if (!body.trimStart().startsWith("[")) return body;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }

  if (!isBlockDocument(parsed)) return body;

  return blocks(parsed as Block[]).trim();
}
