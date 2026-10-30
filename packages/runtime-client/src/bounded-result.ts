import { asRecord } from "@aven/agents/values";

// What a tool gives back is kept in the run's history, which the model reads again every turn and
// the journal stores whole. A command can print a build log of many megabytes, and that serves no
// one: the end of an output is where a failure is. So each long text a result carries (stdout,
// stderr, a file's content) is cut to its last part, with a note, and says so where the result has
// a flag for it. Anything that is not text, such as a screenshot's image, is left as it is.
const MAX_TEXT_CHARS = 100_000;
// A result bigger than this even then, an image of an absurd size, is refused instead of kept.
const MAX_RESULT_BYTES = 8 * 1024 * 1024;
const CUT_NOTE = "[… output cut: it was too long to keep …]\n";

const sizeOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const refused = () => new Error("The tool's result was too long to keep");

export function boundResult<T>(result: T): T {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    if (sizeOf(result) > MAX_RESULT_BYTES) throw refused();
    return result;
  }
  const bounded = { ...asRecord(result) };
  let cut = false;
  for (const [key, value] of Object.entries(bounded)) {
    if (typeof value !== "string" || value.length <= MAX_TEXT_CHARS) continue;
    bounded[key] = `${CUT_NOTE}${value.slice(value.length - MAX_TEXT_CHARS)}`;
    // The command result says when its own output was cut.
    if (`${key}Truncated` in bounded) bounded[`${key}Truncated`] = true;
    cut = true;
  }
  const out = cut ? (bounded as T) : result;
  if (sizeOf(out) > MAX_RESULT_BYTES) throw refused();
  return out;
}
