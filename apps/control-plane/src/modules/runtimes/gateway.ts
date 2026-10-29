import { randomBytes } from "node:crypto";

import { DEFAULT_MODEL_IDS, type ModelConfig, type Provider } from "@aven/agents/model";
import type { RunModel } from "@aven/protocol/runtime-wire";

const TOKEN_PREFIX = "avgw_";

const DEFAULT_UPSTREAMS = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
};

const SEGMENTS = {
  anthropic: "anthropic",
  openai: "openai",
  "openai-compatible": "compatible",
} as const satisfies Record<Provider, string>;

// The only calls a runtime may make, per provider. Everything else (model lists, files, batches)
// stays unreachable.
const ALLOWED_PATHS: Record<Provider, readonly string[]> = {
  anthropic: ["/v1/messages"],
  openai: ["/responses", "/chat/completions"],
  "openai-compatible": ["/chat/completions"],
};

const PASS_REQUEST_HEADERS = ["accept", "anthropic-version", "anthropic-beta"];
const PASS_RESPONSE_HEADERS = ["content-type", "retry-after", "request-id", "x-request-id"];

type Grant = { model: ModelConfig; key: string | undefined };

const ENV_KEYS = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" } as const;

const envKeyFor = (provider: Provider) =>
  provider === "openai-compatible" ? undefined : process.env[ENV_KEYS[provider]];

// With no provider of their own, a sender runs on the environment's shared one.
export function environmentModel(): ModelConfig {
  const provider = (process.env.AGENT_PROVIDER ?? "anthropic") as Provider;
  if (provider !== "openai" && provider !== "anthropic") {
    throw new Error(`AGENT_PROVIDER must be "openai" or "anthropic", got "${provider}"`);
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
    if (!key && config.provider !== "openai-compatible") {
      throw new Error(`${ENV_KEYS[config.provider]} is not set`);
    }
    const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
    this.#grants.set(token, { model: config, key });
    this.#tokens.set(runId, token);
    return {
      provider: config.provider,
      modelId: config.modelId,
      reasoningEffort: config.reasoningEffort,
      effortLevels: config.effortLevels && [...config.effortLevels],
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
    const presented =
      request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ??
      request.headers.get("x-api-key");
    const grant = presented ? this.#grants.get(presented) : undefined;
    if (!grant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { provider } = grant.model;
    if (SEGMENTS[provider] !== segment) {
      return Response.json({ error: "Wrong provider for this run" }, { status: 403 });
    }
    const upstreamPath = `/${path}`;
    if (request.method !== "POST" || !ALLOWED_PATHS[provider].includes(upstreamPath)) {
      return Response.json({ error: "Not allowed" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    this.#pin(body, grant.model, upstreamPath);

    const headers = new Headers({ "content-type": "application/json" });
    for (const name of PASS_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (grant.key) {
      if (provider === "anthropic") headers.set("x-api-key", grant.key);
      else headers.set("authorization", `Bearer ${grant.key}`);
    }

    let upstream: Response;
    try {
      upstream = await fetch(this.#upstreamUrl(grant.model, upstreamPath), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch {
      return Response.json({ error: "The model provider could not be reached" }, { status: 502 });
    }

    const out = new Headers();
    for (const name of PASS_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }

  #upstreamUrl(model: ModelConfig, path: string) {
    if (model.provider === "anthropic") return `${this.upstreams.anthropic}${path}`;
    if (model.provider === "openai") return `${this.upstreams.openai}${path}`;
    return `${model.baseUrl?.replace(/\/$/, "")}${path}`;
  }

  // The runtime picks neither the model nor the reasoning effort: the sender's choice wins.
  #pin(body: Record<string, unknown>, model: ModelConfig, path: string) {
    body.model =
      model.modelId ??
      (model.provider === "openai-compatible" ? body.model : DEFAULT_MODEL_IDS[model.provider]);
    const effort = model.reasoningEffort;
    const record = (value: unknown) =>
      typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

    if (model.provider === "anthropic") {
      const config = record(body.output_config);
      if (effort) body.output_config = { ...config, effort };
      else {
        delete config.effort;
        body.output_config = config;
      }
    } else if (model.provider === "openai") {
      if (path === "/responses") {
        const reasoning = record(body.reasoning);
        if (effort) body.reasoning = { ...reasoning, effort };
        else if ("effort" in reasoning) {
          delete reasoning.effort;
          body.reasoning = reasoning;
        }
      }
      // Chat completions takes the level at the top level, the Responses API inside `reasoning`.
      if (path === "/chat/completions") {
        if (effort) body.reasoning_effort = effort;
        else delete body.reasoning_effort;
      }
    }
  }
}

export const runGateway = new RunGateway();
