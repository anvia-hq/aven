export const MAX_OUTPUT_CHARS = 30_000;

// Keeps the end of the text, which is where command output usually matters (errors, summaries).
export function truncateTail(text: string, max = MAX_OUTPUT_CHARS) {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(-max), truncated: true };
}
