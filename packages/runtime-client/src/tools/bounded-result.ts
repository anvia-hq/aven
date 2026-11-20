import { asRecord } from "@aven/agents/values";

const MAX_TEXT_CHARS = 100_000;
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

    if (`${key}Truncated` in bounded) bounded[`${key}Truncated`] = true;

    cut = true;
  }
  const out = cut ? (bounded as T) : result;

  if (sizeOf(out) > MAX_RESULT_BYTES) throw refused();

  return out;
}
