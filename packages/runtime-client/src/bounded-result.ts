import { asRecord } from "@aven/agents/values";

// The run's journal refuses a tool result over a megabyte, and that ends the whole run, so a command
// that prints a build log or a test report could kill it. A result is cut to fit instead: the
// longest text first, from its start, since the end of an output is where a failure is. The model
// sees less, never nothing, and a result that is not output (an image, say) is left alone unless
// it cannot be made small.
const MAX_RESULT_BYTES = 700_000;
const SMALLEST_FIELD_CHARS = 2_000;
const CUT_NOTE = "[… output cut: it was too long to keep …]\n";

const sizeOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function boundResult<T>(result: T): T {
  if (sizeOf(result) <= MAX_RESULT_BYTES) return result;
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("The tool's result was too long to keep");
  }
  const bounded = { ...asRecord(result) };
  while (sizeOf(bounded) > MAX_RESULT_BYTES) {
    // The longest text there is, if one is still worth cutting.
    const [key, text] = Object.entries(bounded)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .reduce<[string, string]>(
        (longest, entry) => (entry[1].length > longest[1].length ? entry : longest),
        ["", ""],
      );
    if (text.length <= SMALLEST_FIELD_CHARS)
      throw new Error("The tool's result was too long to keep");
    const kept = text.slice(text.length - Math.floor(text.length / 2));
    bounded[key] = text.startsWith(CUT_NOTE) ? kept : `${CUT_NOTE}${kept}`;
    // The command result says when its own output was cut.
    if (`${key}Truncated` in bounded) bounded[`${key}Truncated`] = true;
  }
  return bounded as T;
}
