export function newMentions(
  known: readonly string[] | null,
  waiting: readonly string[],
  open: readonly (string | undefined)[],
) {
  if (known === null) return [];

  return waiting.filter((id) => !known.includes(id) && !open.includes(id));
}

export function unopened(waiting: readonly string[], open: readonly (string | undefined)[]) {
  return waiting.filter((id) => !open.includes(id));
}
