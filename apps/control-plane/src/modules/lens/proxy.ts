import { createHmac, timingSafeEqual } from "node:crypto";

import { errorMessage } from "@aven/agents/values";
import type { RunLens } from "@aven/protocol/types";
import { lensSettingsService } from "./service";

export const LENS_PROXY_PATH = "/runtimes/lens";

const TOKEN_PREFIX = "avlens_";
const GRACE_MS = 5 * 60_000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const ALLOWED_PATHS = new Set(["api/public/otel/v1/traces", "api/public/otel/v1/logs"]);
const PASS_REQUEST_HEADERS = ["content-type", "content-encoding", "accept"];
const PASS_RESPONSE_HEADERS = ["content-type"];

function defaultSecret() {
  const secret = process.env.PROVIDER_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    throw new Error(
      "The Lens proxy has no token secret: set PROVIDER_ENCRYPTION_KEY or BETTER_AUTH_SECRET",
    );
  }

  return secret;
}

function reject(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function parseBasicAuth(header: string | null): { runtimeId: string; token: string } | null {
  if (!header || !header.startsWith("Basic ")) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length).trim(), "base64").toString("utf8");
  } catch {
    return null;
  }

  const colon = decoded.indexOf(":");

  if (colon <= 0) return null;

  return { runtimeId: decoded.slice(0, colon), token: decoded.slice(colon + 1) };
}

function equalTokens(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export class LensProxy {
  #seen = new Map<string, number>();
  #revoked = new Set<string>();
  #secret: string;

  constructor(
    private upstream: () => Promise<RunLens | undefined> = () => lensSettingsService.forRun(),
    private isOnline: (runtimeId: string) => boolean = () => false,
    secret?: string,
    private fetchFn: typeof fetch = fetch,
    private now: () => number = () => Date.now(),
  ) {
    this.#secret = secret ?? defaultSecret();
  }

  tokenFor(runtimeId: string) {
    const digest = createHmac("sha256", this.#secret)
      .update(`lens-proxy:${runtimeId}`)
      .digest("base64url");
    return `${TOKEN_PREFIX}${digest}`;
  }

  forRunner(runtimeId: string, lens: RunLens | undefined): RunLens | undefined {
    if (!lens) return undefined;

    this.#revoked.delete(runtimeId);
    this.#seen.set(runtimeId, this.now());
    return {
      baseUrl: LENS_PROXY_PATH,
      publicKey: runtimeId,
      secretKey: this.tokenFor(runtimeId),
      captureMode: lens.captureMode,
    };
  }

  revoke(runtimeId: string) {
    this.#seen.delete(runtimeId);
    this.#revoked.add(runtimeId);
  }

  #permitted(runtimeId: string) {
    if (this.#revoked.has(runtimeId)) return false;

    if (this.isOnline(runtimeId)) return true;

    const seenAt = this.#seen.get(runtimeId);
    return seenAt !== undefined && seenAt + GRACE_MS > this.now();
  }

  async forward(request: Request, path: string): Promise<Response> {
    if (request.method !== "POST") return reject("Method not allowed", 405);

    if (!ALLOWED_PATHS.has(path)) return reject("Not found", 404);

    const auth = parseBasicAuth(request.headers.get("authorization"));

    if (!auth) return reject("Unauthorized", 401);

    const expected = this.tokenFor(auth.runtimeId);

    if (!equalTokens(auth.token, expected) || !this.#permitted(auth.runtimeId)) {
      return reject("Unauthorized", 401);
    }

    const target = await this.upstream();

    if (!target) return reject("Anvia Lens is not configured", 503);

    const body = await request.arrayBuffer();

    if (body.byteLength > MAX_BODY_BYTES) return reject("Payload too large", 413);

    const headers = new Headers();
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${target.publicKey}:${target.secretKey}`).toString("base64")}`,
    );

    for (const name of PASS_REQUEST_HEADERS) {
      const value = request.headers.get(name);

      if (value) headers.set(name, value);
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await this.fetchFn(`${target.baseUrl}/${path}`, {
        method: "POST",
        headers,
        body,
        signal: request.signal,
      });
    } catch (error) {
      console.warn(`Anvia Lens proxy forward failed (${path}):`, errorMessage(error));
      return reject("Could not reach Anvia Lens", 502);
    }

    const responseHeaders = new Headers();

    for (const name of PASS_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(name);

      if (value) responseHeaders.set(name, value);
    }

    return new Response(await upstreamResponse.arrayBuffer(), {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  }
}
