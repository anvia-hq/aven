import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Resolves `input` against `root` and rejects anything that lands outside it, following symlinks
// through the deepest existing ancestor so a link inside the root cannot point out of it.
export async function resolveWithin(root: string, input: string) {
  const base = await realpath(root);
  const absolute = resolve(base, input);

  const missing: string[] = [];
  let existing = absolute;
  let real: string | undefined;
  while (real === undefined) {
    try {
      real = await realpath(existing);
    } catch (error) {
      const parent = dirname(existing);
      if (parent === existing) throw error;
      missing.push(basename(existing));
      existing = parent;
    }
  }

  const target = join(real, ...missing.reverse());
  const rel = relative(base, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Path is outside the project root: ${input}`);
  }
  return { absolute: target, relative: rel === "" ? "." : rel };
}
