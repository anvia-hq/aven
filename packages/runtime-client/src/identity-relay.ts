const TOKEN_PATH = "/workload-identity/token";

export type IdentityRelay = { port: number; stop: () => void };

export function startIdentityRelay(
  controlPlane: string,
  fetchFn: typeof fetch = fetch,
): IdentityRelay {
  const target = `${controlPlane.replace(/\/+$/, "")}${TOKEN_PATH}`;
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST" || new URL(request.url).pathname !== TOKEN_PATH) {
        return new Response("Not found", { status: 404 });
      }
      const headers = new Headers();
      for (const name of ["authorization", "content-type"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      try {
        const answer = await fetchFn(target, {
          method: "POST",
          headers,
          body: await request.arrayBuffer(),
          signal: AbortSignal.timeout(20_000),
        });
        return new Response(answer.body, {
          status: answer.status,
          headers: { "content-type": answer.headers.get("content-type") ?? "application/json" },
        });
      } catch {
        return new Response("The control plane could not be reached", { status: 502 });
      }
    },
  });
  return { port: server.port as number, stop: () => void server.stop(true) };
}
