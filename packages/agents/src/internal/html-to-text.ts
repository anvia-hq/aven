const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntity(entity: string, body: string) {
  const lower = body.toLowerCase();
  const named = NAMED_ENTITIES[lower];

  if (named !== undefined) return named;

  if (lower.startsWith("#x")) {
    const code = Number.parseInt(lower.slice(2), 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }

  if (lower.startsWith("#")) {
    const code = Number.parseInt(lower.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }

  return entity;
}

function decodeEntities(text: string) {
  return text.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi, decodeEntity);
}

export function htmlToText(html: string) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const rawTitle = withoutComments.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = rawTitle ? decodeEntities(rawTitle).replace(/\s+/g, " ").trim() : undefined;
  const body = decodeEntities(
    withoutComments
      .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, "")
      .replace(
        /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_match, href, text) => `${text} (${href})`,
      )
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(
        /<\/(p|div|h[1-6]|tr|ul|ol|section|article|pre|table|blockquote)>|<br\s*\/?>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return title ? `${title}\n\n${body}` : body;
}
