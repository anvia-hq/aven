export function hasWords(text: string, words: string | undefined) {
  if (!words) return true;

  const lower = text.toLowerCase();
  return words
    .toLowerCase()
    .split(/\s+/)
    .every((word) => lower.includes(word));
}
