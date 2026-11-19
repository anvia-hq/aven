const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

export function parsePort(text: string) {
  const bare = text
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  const separator = bare.lastIndexOf(":");
  const host = separator > 0 ? bare.slice(0, separator).toLowerCase() : "";
  const digits = separator >= 0 ? bare.slice(separator + 1) : bare;

  if (host !== "" && !LOCAL_HOSTS.has(host)) return null;

  if (!/^\d{1,5}$/.test(digits)) return null;

  const port = Number(digits);
  return port >= 1 && port <= 65535 ? port : null;
}

export function addressOf(port: number) {
  return `http://localhost:${port}`;
}
