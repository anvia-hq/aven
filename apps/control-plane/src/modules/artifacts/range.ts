/**
 * The bytes a `Range: bytes=start-end` header asks of a file of `size` bytes: `null` for no range
 * (or one that is not a single range, which is answered with the whole file), and `"unsatisfiable"`
 * for one that lies outside the file. A browser asks for a video this way, and Safari plays one only
 * if it is answered (decision 0136).
 */
export function byteRange(header: string | null | undefined, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start: number;
  let end: number;
  if (match[1] === "") {
    // The last N bytes.
    const last = Number(match[2]);
    if (last === 0) return "unsatisfiable";
    start = Math.max(size - last, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
