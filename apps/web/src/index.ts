import { greet } from "@aven/shared";

const server = Bun.serve({
  port: 3000,
  fetch: () => new Response(greet("Aven")),
});

console.log(`Listening on ${server.url}`);
