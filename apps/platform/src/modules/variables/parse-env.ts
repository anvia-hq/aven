import type { EnvIssue, ParsedEnv } from "./types";
import { MAX_NAME_LENGTH, MAX_VALUE_LENGTH, MAX_VARIABLES } from "./types";

const LINE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/;

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t" };

function unquote(raw: string) {
  const text = raw.trim();
  const quote = text[0];

  if (quote === '"' || quote === "'") {
    const end = text.indexOf(quote, 1);

    if (end > 0 && (text.slice(end + 1).trim() === "" || text.slice(end + 1).trim()[0] === "#")) {
      const inner = text.slice(1, end);
      return quote === '"'
        ? inner.replace(/\\(n|r|t|"|\\)/g, (_, c: string) => ESCAPES[c] ?? c)
        : inner;
    }
  }

  const comment = text.search(/\s#/);
  return (comment === -1 ? text : text.slice(0, comment)).trim();
}

export function parseEnv(source: string): ParsedEnv {
  const entries = new Map<string, string>();
  const issues: EnvIssue[] = [];
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    let text = lines[index]!.trim();

    if (!text || text.startsWith("#")) continue;

    const line = index + 1;

    const opening = LINE.exec(text);

    if (opening && /^["']/.test(opening[2]!.trim())) {
      const quote = opening[2]!.trim()[0]!;
      while (
        !new RegExp(`^${quote}[\\s\\S]*(?<!\\\\)${quote}\\s*(#.*)?$`).test(
          LINE.exec(text)![2]!.trim(),
        ) &&
        index + 1 < lines.length
      ) {
        index += 1;
        text += `\n${lines[index]}`;
      }
    }

    const match = LINE.exec(text);

    if (!match) {
      issues.push({ line, text: text.slice(0, 60), reason: "Not NAME=value" });
      continue;
    }

    const name = match[1]!;
    const value = unquote(match[2]!);

    if (name.length > MAX_NAME_LENGTH) {
      issues.push({ line, text: name.slice(0, 40), reason: "Name is too long" });
    } else if (value.length > MAX_VALUE_LENGTH) {
      issues.push({ line, text: name, reason: "Value is too long" });
    } else {
      entries.delete(name);
      entries.set(name, value);
    }
  }

  const list = [...entries].map(([name, value]) => ({ name, value }));

  if (list.length > MAX_VARIABLES) {
    issues.push({
      line: 0,
      text: "",
      reason: `Only the first ${MAX_VARIABLES} variables are added`,
    });
  }

  return { entries: list.slice(0, MAX_VARIABLES), issues };
}

export const looksLikeEnv = (text: string) =>
  /\r?\n/.test(text.trim()) ? parseEnv(text).entries.length > 0 : LINE.test(text.trim());
