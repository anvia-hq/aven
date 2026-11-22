import { randomBytes, timingSafeEqual } from "node:crypto";

import { errorMessage } from "@aven/agents/values";
import type { RunLens } from "@aven/protocol/types";
import { lensSettingsService } from "./service";

export const LENS_PROXY_PATH = "/runtimes/lens";

const TOKEN_PREFIX = "avlens_";
const GRACE_MS = 5 * 60_000;
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const ALLOWED_PATHS = new Set(["api/public/otel/v1/traces", "api/public/otel/v1/logs"]);
const PASS_REQUEST_HEADERS = ["content-type", "content-encoding", "accept"];
const PASS_RESPONSE_HEADERS = ["content-type"];

type RunnerGrant = { token: string; seenAt: number };

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

function mintToken() {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

async function readBoundedBody(
  request: Request,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = request.headers.get("content-length");

  if (declared !== null) {
    const length = Number(declared);

    if (Number.isFinite(length) && length > limit) return null;
  }

  if (!request.body) return new Uint8Array(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) break;

      if (!value) continue;

      total += value.byteLength;

      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

export class LensProxy {
  #grants = new Map<string, RunnerGrant>();

  constructor(
    private upstream: () => Promise<RunLens | undefined> = () => lensSettingsService.forRun(),
    private isOnline: (runtimeId: string) => boolean = () => false,
    private fetchFn: typeof fetch = fetch,
    private now: () => number = () => Date.now(),
    private maxBodyBytes: number = DEFAULT_MAX_BODY_BYTES,
  ) {}

  forRunner(runtimeId: string, lens: RunLens | undefined): RunLens | undefined {
    if (!lens) return undefined;

    const existing = this.#grants.get(runtimeId);
    const token = existing ? existing.token : mintToken();
    this.#grants.set(runtimeId, { token, seenAt: this.now() });
    return {
      baseUrl: LENS_PROXY_PATH,
      publicKey: runtimeId,
      secretKey: token,
      captureMode: lens.captureMode,
    };
  }

  revoke(runtimeId: string) {
    this.#grants.delete(runtimeId);
  }

  #verify(runtimeId: string, token: string) {
    const grant = this.#grants.get(runtimeId);

    if (!grant || !equalTokens(token, grant.token)) return false;

    if (this.isOnline(runtimeId)) return true;

    return grant.seenAt + GRACE_MS > this.now();
  }

  async forward(request: Request, path: string): Promise<Response> {
    if (request.method !== "POST") return reject("Method not allowed", 405);

    if (!ALLOWED_PATHS.has(path)) return reject("Not found", 404);

    const auth = parseBasicAuth(request.headers.get("authorization"));

    if (!auth || !this.#verify(auth.runtimeId, auth.token)) {
      return reject("Unauthorized", 401);
    }

    const target = await this.upstream();

    if (!target) return reject("Anvia Lens is not configured", 503);

    const body = await readBoundedBody(request, this.maxBodyBytes);

    if (!body) return reject("Payload too large", 413);

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
