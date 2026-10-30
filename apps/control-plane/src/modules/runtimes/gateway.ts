import { randomBytes } from "node:crypto";

import { DEFAULT_MODEL_IDS, type ModelConfig, type Provider } from "@aven/agents/model";
import type { RunModel } from "@aven/protocol/runtime-wire";

import { UnavailableError } from "../../errors";
import { bearerToken } from "./bearer";

const TOKEN_PREFIX = "avgw_";

const DEFAULT_UPSTREAMS = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
};

const SEGMENTS = {
  anthropic: "anthropic",
  openai: "openai",
  azure: "azure",
  "openai-compatible": "compatible",
} as const satisfies Record<Provider, string>;

// The only calls a runtime may make, per provider. Everything else (model lists, files, batches)
// stays unreachable.
const ALLOWED_PATHS: Record<Provider, readonly string[]> = {
  anthropic: ["/v1/messages"],
  openai: ["/responses", "/chat/completions"],
  azure: ["/responses", "/chat/completions"],
  "openai-compatible": ["/chat/completions"],
};

const PASS_REQUEST_HEADERS = ["accept", "anthropic-version", "anthropic-beta"];
const PASS_RESPONSE_HEADERS = ["content-type", "retry-after", "request-id", "x-request-id"];

type Grant = { model: ModelConfig; key: string | undefined };

// Azure and compatible servers have no shared environment key: the user's own is required or optional.
const ENV_KEYS = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" } as const;

/** The model a run asked for cannot be used, such as a missing environment key. */
export class ModelUnavailableError extends UnavailableError {}

const envKeyFor = (provider: Provider) =>
  provider === "anthropic" || provider === "openai" ? process.env[ENV_KEYS[provider]] : undefined;

// With no provider of their own, a sender runs on the environment's shared one.
export function environmentModel(): ModelConfig {
  const provider = (process.env.AGENT_PROVIDER ?? "anthropic") as Provider;
  if (provider !== "openai" && provider !== "anthropic") {
    throw new ModelUnavailableError(
      `AGENT_PROVIDER must be "openai" or "anthropic", got "${provider}"`,
    );
  }
  return { provider, modelId: process.env.AGENT_MODEL || undefined };
}

// Lets a runtime use a model without ever holding the provider key (decision 0008). Each run gets
// a token that maps to the sender's chosen provider, model and effort; the gateway adds the key,
// overwrites the model and effort in the request and streams the vendor's answer back untouched.
export class RunGateway {
  #grants = new Map<string, Grant>();
  #tokens = new Map<string, string>();

  constructor(private upstreams: { anthropic: string; openai: string } = DEFAULT_UPSTREAMS) {}

  // Throws when the model cannot be used (such as a missing environment key), before any run starts.
  issue(runId: string, config: ModelConfig): RunModel {
    const key = config.apiKey ?? envKeyFor(config.provider);
    if (!key && config.provider === "azure") {
      throw new ModelUnavailableError("This Azure provider has no API key");
    }
    if (!key && (config.provider === "anthropic" || config.provider === "openai")) {
      throw new ModelUnavailableError(`${ENV_KEYS[config.provider]} is not set`);
    }
    const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
    this.#grants.set(token, { model: config, key });
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

  // Ends the grant with the run, so a token a runtime kept is worthless afterwards.
  revoke(runId: string) {
    const token = this.#tokens.get(runId);
    if (!token) return;
    this.#tokens.delete(runId);
    this.#grants.delete(token);
  }

  async forward(request: Request, segment: string, path: string): Promise<Response> {
    const presented = bearerToken(request.headers) ?? request.headers.get("x-api-key");
    const grant = presented ? this.#grants.get(presented) : undefined;
    if (!grant) return reject("Unauthorized", 401);
    const { provider } = grant.model;
    if (SEGMENTS[provider] !== segment) return reject("Wrong provider for this run", 403);
    const upstreamPath = `/${path}`;
    if (request.method !== "POST" || !ALLOWED_PATHS[provider].includes(upstreamPath)) {
      return reject("Not allowed", 404);
    }

    const body = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) return reject("Invalid JSON", 400);
    pin(body as Record<string, unknown>, grant.model, upstreamPath);

    try {
      const upstream = await fetch(this.#upstreamUrl(grant.model, upstreamPath), {
        method: "POST",
        headers: upstreamHeaders(request, grant),
        body: JSON.stringify(body),
        signal: request.signal,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: passHeaders(upstream.headers, PASS_RESPONSE_HEADERS),
      });
    } catch {
      return reject("The model provider could not be reached", 502);
    }
  }

  #upstreamUrl(model: ModelConfig, path: string) {
    if (model.provider === "anthropic") return `${this.upstreams.anthropic}${path}`;
    if (model.provider === "openai") return `${this.upstreams.openai}${path}`;
    // The resource's v1 API, the same root `@anvia/azure` builds from a resource URL.
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

// The runtime's own credentials never go upstream: the run's key does.
function upstreamHeaders(request: Request, grant: Grant) {
  const headers = passHeaders(request.headers, PASS_REQUEST_HEADERS);
  headers.set("content-type", "application/json");
  if (!grant.key) return headers;
  if (grant.model.provider === "anthropic") headers.set("x-api-key", grant.key);
  else headers.set("authorization", `Bearer ${grant.key}`);
  if (grant.model.provider === "azure") headers.set("api-key", grant.key);
  return headers;
}

const record = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

// The runtime picks neither the model nor the reasoning effort: the sender's choice wins.
function pin(body: Record<string, unknown>, model: ModelConfig, path: string) {
  body.model =
    model.modelId ??
    (model.provider === "openai-compatible" || model.provider === "azure"
      ? body.model
      : DEFAULT_MODEL_IDS[model.provider]);
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
  // Chat completions takes the level at the top level, the Responses API inside `reasoning`.
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

export const runGateway = new RunGateway();
