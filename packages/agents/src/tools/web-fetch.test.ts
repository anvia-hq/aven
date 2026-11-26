import { describe, expect, test } from "bun:test";

import { createServer } from "node:http";

import { htmlToText } from "../internal/html-to-text";
import { pinnedRequest } from "../internal/pinned-request";
import { isPrivateAddress } from "../internal/public-address";
import type { PinnedTarget } from "./types";
import { createWebFetchTool, MAX_FETCH_BYTES } from "./web-fetch";

const publicHost = async () => ["93.184.216.34"];

function serve(respond: (url: string) => Response) {
  const urls: string[] = [];
  const impl = async (target: PinnedTarget) => {
    urls.push(target.url.href);
    return respond(target.url.href);
  };
  return { impl, urls };
}

const html = (body: string) =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

describe("web_fetch", () => {
  test("turns a page into text with its title and links, without scripts or styles", async () => {
    const { impl } = serve(() =>
      html(
        "<html><head><title>Docs</title><style>p{}</style></head><body><script>evil()</script><h1>Intro</h1><p>Read <a href='https://x.dev/a'>this</a> &amp; that.</p><ul><li>one</li><li>two</li></ul></body></html>",
      ),
    );
    const output = await createWebFetchTool({ request: impl, resolve: publicHost }).call({
      url: "https://example.com/docs",
    });
    expect(output).toBe(
      "URL: https://example.com/docs (text/html)\n\nDocs\n\nIntro\nRead this (https://x.dev/a) & that.\n\n- one\n- two",
    );
  });

  test("returns JSON and plain text as they are", async () => {
    const { impl } = serve(() => Response.json({ a: 1 }));
    const output = await createWebFetchTool({ request: impl, resolve: publicHost }).call({
      url: "https://example.com/api",
    });
    expect(output).toContain("URL: https://example.com/api (application/json)");
    expect(output).toContain('\n\n{"a":1}');
  });

  test("pages a long document with offset and next", async () => {
    const { impl } = serve(
      () =>
        new Response("a".repeat(1500) + "b".repeat(1500), {
          headers: { "content-type": "text/plain" },
        }),
    );
    const tool = createWebFetchTool({ request: impl, resolve: publicHost });
    const first = await tool.call({ url: "https://example.com/t", maxChars: 1000 });
    expect(first).toContain("a".repeat(1000));
    expect(first).toContain("Pass offset: 1000 to read more.");
    const last = await tool.call({ url: "https://example.com/t", offset: 2000, maxChars: 1000 });
    expect(last).toContain("b".repeat(1000));
    expect(last).not.toContain("Pass offset:");
  });

  test("refuses addresses on the private network, in a name, a literal, or after a redirect", async () => {
    const { impl, urls } = serve((url) =>
      url === "https://example.com/go"
        ? new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest" },
          })
        : html("secret"),
    );
    const tool = createWebFetchTool({
      request: impl,
      resolve: async (host) => (host === "intranet.test" ? ["10.0.0.5"] : ["93.184.216.34"]),
    });
    for (const url of [
      "http://localhost:8000/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://intranet.test/",
      "http://[::ffff:10.0.0.1]/",
    ]) {
      await expect(tool.call({ url })).rejects.toThrow("private address");
    }
    await expect(tool.call({ url: "https://example.com/go" })).rejects.toThrow("private address");
    expect(urls).toEqual(["https://example.com/go"]);
  });

  test("follows a public redirect and reports the final address", async () => {
    const { impl } = serve((url) =>
      url === "https://example.com/old"
        ? new Response(null, { status: 301, headers: { location: "/new" } })
        : html("<p>moved</p>"),
    );
    const output = await createWebFetchTool({ request: impl, resolve: publicHost }).call({
      url: "https://example.com/old",
    });
    expect(output).toBe("URL: https://example.com/new (text/html)\n\nmoved");
  });

  test("gives up on a redirect loop", async () => {
    const { impl } = serve(
      () => new Response(null, { status: 302, headers: { location: "/again" } }),
    );
    await expect(
      createWebFetchTool({ request: impl, resolve: publicHost }).call({
        url: "https://example.com/a",
      }),
    ).rejects.toThrow("Too many redirects");
  });

  test("only http and https, and not binary files", async () => {
    const { impl } = serve(
      () => new Response("x", { headers: { "content-type": "application/pdf" } }),
    );
    const tool = createWebFetchTool({ request: impl, resolve: publicHost });
    await expect(tool.call({ url: "file:///etc/passwd" })).rejects.toThrow("Only http and https");
    await expect(tool.call({ url: "https://example.com/a.pdf" })).rejects.toThrow("not text");
  });

  test("an error status is an error", async () => {
    const { impl } = serve(() => new Response("nope", { status: 404 }));
    await expect(
      createWebFetchTool({ request: impl, resolve: publicHost }).call({
        url: "https://example.com/x",
      }),
    ).rejects.toThrow("failed with 404");
  });

  test("reports source truncation only when the response exceeds MAX_FETCH_BYTES", async () => {
    const exact = new Uint8Array(MAX_FETCH_BYTES).fill(97);
    const over = new Uint8Array(MAX_FETCH_BYTES + 1).fill(98);
    const { impl } = serve(
      (url) =>
        new Response(url.endsWith("/exact") ? exact : over, {
          headers: { "content-type": "text/plain" },
        }),
    );
    const tool = createWebFetchTool({ request: impl, resolve: publicHost });

    const exactResult = await tool.call({ url: "https://example.com/exact", maxChars: 1000 });
    expect(exactResult).not.toContain("Source response exceeded");
    expect(exactResult).toContain("a".repeat(1000));

    const overResult = await tool.call({
      url: "https://example.com/over",
      offset: MAX_FETCH_BYTES - 10,
      maxChars: 1000,
    });
    expect(overResult).toContain("Source response exceeded 2 MiB and was truncated.");
    expect(overResult).toContain("b".repeat(10));
    expect(overResult).not.toContain("Pass offset:");
  });
});

describe("isPrivateAddress", () => {
  test("private, loopback, link-local and reserved ranges are private; public ones are not", () => {
    for (const address of [
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "127.0.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:7f00:1",
      "::ffff:10.0.0.1",
      "64:ff9b::a00:1",
      "64:ff9b::10.0.0.1",
      "2002:7f00:1::1",
      "2002:c0a8:101::",
      "::",
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
    for (const address of [
      "93.184.216.34",
      "8.8.8.8",
      "172.32.0.1",
      "2606:2800:220:1::1",
      "64:ff9b::808:808",
      "2002:808:808::1",
      "::ffff:8.8.8.8",
    ]) {
      expect(isPrivateAddress(address)).toBe(false);
    }
  });
});

describe("htmlToText", () => {
  test("keeps text order and drops comments", () => {
    expect(htmlToText("<div>a<!-- x --></div><div>b</div>")).toBe("a\nb");
  });

  test("ignores commented titles and decodes named and numeric entities in title and body", () => {
    expect(
      htmlToText(
        "<!-- <title>Ignored</title> --><html><head><title>A &amp; B&apos;s &#8212; Docs</title></head><body><p>It&apos;s &#x2014; &amp;lt;ok&#33; &#x1F600;</p></body></html>",
      ),
    ).toBe("A & B's — Docs\n\nIt's — &lt;ok! 😀");
  });
});

describe("pinnedRequest", () => {
  test("connects to the address it was given and sends the name in Host, whatever the name resolves to", async () => {
    const hosts: (string | undefined)[] = [];
    const server = createServer((request, response) => {
      hosts.push(request.headers.host);
      response.setHeader("content-type", "text/plain");
      response.end("pinned");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number };

    try {
      const response = await pinnedRequest(
        { url: new URL(`http://rebinding.invalid:${port}/x`), address: "127.0.0.1" },
        new AbortController().signal,
      );
      expect(await response.text()).toBe("pinned");
      expect(hosts).toEqual([`rebinding.invalid:${port}`]);
    } finally {
      server.close();
    }
  });

  test("hands back a redirect as it is, without following it", async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 302;
      response.setHeader("location", "/elsewhere");
      response.end();
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as { port: number };

    try {
      const response = await pinnedRequest(
        { url: new URL(`http://a.invalid:${port}/`), address: "127.0.0.1" },
        new AbortController().signal,
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/elsewhere");
    } finally {
      server.close();
    }
  });
});
