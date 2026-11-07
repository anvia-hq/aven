import { bundledLanguages, createHighlighter, type BundledLanguage, type ThemedToken } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const MAX_CHARS = 200_000;

const BY_NAME: Record<string, BundledLanguage> = { dockerfile: "docker", makefile: "make" };

export function languageOf(path: string): BundledLanguage | null {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const byName = BY_NAME[name];
  if (byName) return byName;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const extension = name.slice(dot + 1);
  return extension in bundledLanguages ? (extension as BundledLanguage) : null;
}

let highlighter: ReturnType<typeof createHighlighter> | undefined;
const load = () =>
  (highlighter ??= createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  }));

export type HighlightedLine = ThemedToken[];

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
