import { createHmac } from "node:crypto";

import type { Provider } from "@aven/agents/model";
import { errorMessage } from "@aven/agents/values";

import { assertProviderAddress } from "../providers/address-guard";
import { defaultModelId } from "../providers/default-model";
import { GoogleAuthError, googleAccessToken } from "../providers/google-auth";
import { ENV_KEYS, ModelUnavailableError } from "../providers/resolve-model";
import { bearerToken } from "./bearer";
import type { ModelConfig } from "@aven/agents/types";
import type { RunModel } from "@aven/protocol/types";

const TOKEN_PREFIX = "avgw_";

type Upstreams = { anthropic: string; openai: string; gemini?: string };

const DEFAULT_UPSTREAMS: Upstreams = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com",
};

export function gatewayUpstreams(env: Record<string, string | undefined> = process.env): Upstreams {
  const anthropic = env.AVEN_ANTHROPIC_BASE_URL?.trim();
  return anthropic ? { ...DEFAULT_UPSTREAMS, anthropic } : DEFAULT_UPSTREAMS;
}

const SEGMENTS = {
  anthropic: "anthropic",
  openai: "openai",
  gemini: "gemini",
  bedrock: "bedrock",
  vertex: "vertex",
  azure: "azure",
  "openai-compatible": "compatible",
} as const satisfies Record<Provider, string>;

const ALLOWED_PATHS: Record<Provider, readonly string[]> = {
  anthropic: ["/v1/messages"],
  openai: ["/responses", "/chat/completions"],
  gemini: [],
  bedrock: ["/chat/completions"],
  vertex: ["/chat/completions"],
  azure: ["/responses", "/chat/completions"],
  "openai-compatible": ["/chat/completions"],
};

const GEMINI_PATH = /^\/v1(?:beta)?\/models\/[^/:?]+:(generateContent|streamGenerateContent)$/;

const allowed = (provider: Provider, path: string) =>
  provider === "gemini" ? GEMINI_PATH.test(path) : ALLOWED_PATHS[provider].includes(path);

const PASS_REQUEST_HEADERS = ["accept", "anthropic-version", "anthropic-beta"];
const PASS_RESPONSE_HEADERS = ["content-type", "retry-after", "request-id", "x-request-id"];

type Grant = { model: ModelConfig; key: string | undefined; owner: string };

const TOKEN_SECRET = process.env.PROVIDER_ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;

if (!TOKEN_SECRET) {
  throw new Error(
    "The model gateway has no token secret: set PROVIDER_ENCRYPTION_KEY or BETTER_AUTH_SECRET",
  );
}

const tokenFor = (runId: string, scope: string | undefined) => {
  const subject = scope ? `${scope}:${runId}` : runId;
  const digest = createHmac("sha256", TOKEN_SECRET)
    .update(`run-gateway:${subject}`)
    .digest("base64url");
  return `${TOKEN_PREFIX}${digest}`;
};

export class RunGateway {
  #grants = new Map<string, Grant>();
  #tokens = new Map<string, string>();

  constructor(
    private upstreams: Upstreams = DEFAULT_UPSTREAMS,
    private accessToken: (credential: string) => Promise<string> = googleAccessToken,
  ) {}

  #keyOf(config: ModelConfig) {
    const envKey = ENV_KEYS[config.provider];
    const key = config.apiKey ?? (envKey && process.env[envKey]);

    if (!key && config.provider === "azure") {
      throw new ModelUnavailableError("This Azure provider has no API key");
    }

    if (!key && config.provider === "bedrock") {
      throw new ModelUnavailableError("This Bedrock provider has no API key");
    }

    if (!key && config.provider === "vertex") {
      throw new ModelUnavailableError("This Vertex AI provider has no credential");
    }

    if (!key && envKey) throw new ModelUnavailableError(`${envKey} is not set`);

    return key;
  }

  check(config: ModelConfig) {
    this.#keyOf(config);
  }

  issue(runId: string, config: ModelConfig, scope?: string, tokenOf: string = runId): RunModel {
    const key = this.#keyOf(config);
    const token = tokenFor(tokenOf, scope);
    this.revoke(runId);
    this.#grants.set(token, { model: config, key, owner: runId });
    this.#tokens.set(runId, token);
    return {
      provider: config.provider,
      modelId: config.modelId,
      reasoningEffort: config.reasoningEffort,
      effortLevels: config.effortLevels && [...config.effortLevels],
      contextWindow: config.contextWindow,
      gatewayPath: `/runtimes/gateway/${SEGMENTS[config.provider]}`,
      gatewayToken: token,
    };
  }

  revoke(runId: string) {
    const token = this.#tokens.get(runId);

    if (!token) return;

    this.#tokens.delete(runId);

    if (this.#grants.get(token)?.owner === runId) this.#grants.delete(token);
  }

  async forward(request: Request, segment: string, path: string): Promise<Response> {
    const presented =
      bearerToken(request.headers) ??
      request.headers.get("x-api-key") ??
      request.headers.get("x-goog-api-key");
    const grant = presented ? this.#grants.get(presented) : undefined;

    if (!grant) return reject("Unauthorized", 401);

    const { provider } = grant.model;

    if (SEGMENTS[provider] !== segment) return reject("Wrong provider for this run", 403);

    const upstreamPath = `/${path}`;

    if (request.method !== "POST" || !allowed(provider, upstreamPath)) {
      return reject("Not allowed", 404);
    }

    const body = await request.json().catch(() => null);

    if (typeof body !== "object" || body === null) return reject("Invalid JSON", 400);

    pin(body as Record<string, unknown>, grant.model, upstreamPath);

    let credential = grant;

    if (provider === "vertex" && grant.key) {
      try {
        credential = { ...grant, key: await this.accessToken(grant.key) };
      } catch (error) {
        const reason = error instanceof GoogleAuthError ? error.message : errorMessage(error);
        console.warn(
          `Model gateway: no Google access token for model ${grant.model.modelId}:`,
          reason,
        );
        return reject(reason, 502);
      }
    }

    try {
      const upstreamUrl = this.#upstreamUrl(grant.model, upstreamPath, request);
      await assertProviderAddress(provider, upstreamUrl);
      const upstream = await fetch(upstreamUrl, {
        redirect: "error",
        method: "POST",
        headers: upstreamHeaders(request, credential),
        body: JSON.stringify(body),
        signal: request.signal,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: passHeaders(upstream.headers, PASS_RESPONSE_HEADERS),
      });
    } catch (error) {
      if (!request.signal.aborted) {
        console.warn(
          `Model gateway: a request to ${provider} model ${grant.model.modelId} failed:`,
          errorMessage(error),
        );
      }

      return reject("The model provider could not be reached", 502);
    }
  }

  #upstreamUrl(model: ModelConfig, path: string, request: Request) {
    if (model.provider === "gemini") {
      const call = path.slice(path.lastIndexOf(":"));
      const id = encodeURIComponent(model.modelId ?? defaultModelId("gemini") ?? "");
      const sse = new URL(request.url).searchParams.get("alt") === "sse" ? "?alt=sse" : "";
      return `${this.upstreams.gemini ?? DEFAULT_UPSTREAMS.gemini}/v1beta/models/${id}${call}${sse}`;
    }

    if (model.provider === "anthropic") return `${this.upstreams.anthropic}${path}`;

    if (model.provider === "openai") return `${this.upstreams.openai}${path}`;

    if (model.provider === "azure") return `${model.baseUrl?.replace(/\/+$/, "")}/openai/v1${path}`;

    return `${model.baseUrl?.replace(/\/$/, "")}${path}`;
  }
}

const reject = (error: string, status: number) => Response.json({ error }, { status });

function passHeaders(from: Headers, names: readonly string[]) {
  const headers = new Headers();
  for (const name of names) {
    const value = from.get(name);

    if (value) headers.set(name, value);
  }
  return headers;
}

function upstreamHeaders(request: Request, grant: Grant) {
  const headers = passHeaders(request.headers, PASS_REQUEST_HEADERS);
  headers.set("content-type", "application/json");

  if (!grant.key) return headers;

  if (grant.model.provider === "anthropic") headers.set("x-api-key", grant.key);
  else if (grant.model.provider === "gemini") headers.set("x-goog-api-key", grant.key);
  else headers.set("authorization", `Bearer ${grant.key}`);

  if (grant.model.provider === "azure") headers.set("api-key", grant.key);

  return headers;
}

const record = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

function pin(body: Record<string, unknown>, model: ModelConfig, path: string) {
  if (model.provider === "gemini") return;

  body.model = model.modelId ?? defaultModelId(model.provider) ?? body.model;

  if (model.provider === "anthropic") pinAnthropicEffort(body, model.reasoningEffort);

  if (model.provider === "openai" || model.provider === "azure")
    pinOpenAiEffort(body, model.reasoningEffort, path);
}

function pinAnthropicEffort(body: Record<string, unknown>, effort: string | undefined) {
  const config = record(body.output_config);

  if (effort) config.effort = effort;
  else delete config.effort;

  body.output_config = config;
}

function pinOpenAiEffort(body: Record<string, unknown>, effort: string | undefined, path: string) {
  if (path === "/chat/completions") {
    if (effort) body.reasoning_effort = effort;
    else delete body.reasoning_effort;

    return;
  }

  const reasoning = record(body.reasoning);

  if (effort) body.reasoning = { ...reasoning, effort };
  else if ("effort" in reasoning) {
    delete reasoning.effort;
    body.reasoning = reasoning;
  }
}

export const runGateway = new RunGateway(gatewayUpstreams());
