export function parsePort(text: string) {
  const trimmed = text.trim().replace(/^:/, "");

  if (!/^\d{1,5}$/.test(trimmed)) return null;

  const port = Number(trimmed);
  return port >= 1 && port <= 65535 ? port : null;
}
