/** Whether a text has all the words, in any order and whatever the case; no words is always true. */
export function hasWords(text: string, words: string | undefined) {
  if (!words) return true;
  const lower = text.toLowerCase();
  return words
    .toLowerCase()
    .split(/\s+/)
    .every((word) => lower.includes(word));
}
