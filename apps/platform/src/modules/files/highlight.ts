import { bundledLanguages, createHighlighter, type BundledLanguage, type ThemedToken } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Past this a file is shown plain: colouring it would hold the page up for little gain.
const MAX_CHARS = 200_000;

// Files named for what they are, not for an extension.
const BY_NAME: Record<string, BundledLanguage> = { dockerfile: "docker", makefile: "make" };

/** The grammar for a file, from its name, or null when none is known. */
export function languageOf(path: string): BundledLanguage | null {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const byName = BY_NAME[name];
  if (byName) return byName;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const extension = name.slice(dot + 1);
  return extension in bundledLanguages ? (extension as BundledLanguage) : null;
}

// One highlighter for the page, made when the first file is coloured. Both themes are colourings
// of the same tokens, so the page picks one with CSS and a change of theme needs no new pass.
let highlighter: ReturnType<typeof createHighlighter> | undefined;
const load = () =>
  (highlighter ??= createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  }));

export type HighlightedLine = ThemedToken[];

/** The text as lines of coloured tokens, or null when the file is too big or has no known grammar. */
export async function highlight(text: string, path: string): Promise<HighlightedLine[] | null> {
  const lang = languageOf(path);
  if (!lang || text.length > MAX_CHARS) return null;
  const shiki = await load();
  await shiki.loadLanguage(lang);
  const { tokens } = shiki.codeToTokens(text, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
  return tokens;
}
