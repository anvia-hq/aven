export function nextUnread(
  unread: string[],
  finished: string[],
  openId: string | undefined,
  known: string[],
) {
  const wanted = new Set(known);
  const next = new Set(unread.filter((id) => wanted.has(id) && id !== openId));
  for (const id of finished) if (id !== openId && wanted.has(id)) next.add(id);
  const result = [...next];
  const same = result.length === unread.length && result.every((id, index) => id === unread[index]);
  return same ? unread : result;
}
