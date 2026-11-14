import { describe, expect, test } from "bun:test";

import {
  EMBED_COOKIE,
  parseHead,
  requestForPort,
  responseForBrowser,
  serializeHead,
} from "./http-head";

const head = (lines: string[]) => parseHead(lines.join("\r\n"))!;

describe("a request to a port", () => {
  test("carries a WebSocket upgrade both ways", () => {
    const parsed = head([
      "GET /hmr HTTP/1.1",
      "Host: 5173-00000000-0000-4000-8000-000000000001.aven.run",
      "Upgrade: websocket",
      "Connection: Upgrade",
      "",
      "",
    ]);
    const { head: forwarded, upgrade } = requestForPort(parsed, 5173);
    expect(upgrade).toBe(true);
    expect(serializeHead(forwarded)).toContain("Connection: Upgrade\r\n");
  });
});

describe("an answer from a port", () => {
  const answer = (lines: string[]) => responseForBrowser(head(lines), 3000);

  test("keeps a Location to another address", () => {
    const rewritten = answer(["HTTP/1.1 302 Found", "Location: https://example.com/x", "", ""]);
    expect(serializeHead(rewritten)).toContain("Location: https://example.com/x\r\n");
  });

  test("is no-referrer, framable by the panel, and does not hand out its own cookie", () => {
    const rewritten = answer([
      "HTTP/1.1 200 OK",
      "Set-Cookie: sid=1; Domain=.aven.run; Path=/",
      `Set-Cookie: ${EMBED_COOKIE}=stolen; Path=/`,
      "X-Frame-Options: DENY",
      "Referrer-Policy: unsafe-url",
      "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'",
      "",
      "",
    ]);
    const sent = serializeHead(rewritten);
    expect(sent).toContain("Set-Cookie: sid=1; Path=/\r\n");
    expect(sent).not.toContain("Domain=");
    expect(sent).not.toContain(EMBED_COOKIE);
    expect(sent).not.toContain("X-Frame-Options");
    expect(sent).not.toContain("frame-ancestors");
    expect(sent).toContain("Content-Security-Policy: default-src 'self'\r\n");
    expect(sent).toContain("Referrer-Policy: no-referrer\r\n");
  });
});
