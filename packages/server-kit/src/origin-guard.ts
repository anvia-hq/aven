const READS = new Set(["GET", "HEAD", "OPTIONS"]);

export function foreignOrigin(request: Request, trusted: readonly string[]) {
  if (READS.has(request.method)) return undefined;

  const origin = request.headers.get("origin");

  if (origin === null || trusted.includes(origin)) return undefined;

  return new Response("Forbidden origin", { status: 403 });
}
