import { createHmac, randomBytes } from "node:crypto";

import type { ModelConfig, Provider } from "@aven/agents/model";
import { errorMessage } from "@aven/agents/values";
import type { RunModel } from "@aven/protocol/runtime-wire";

import { defaultModelId } from "../providers/default-model";
import { ENV_KEYS, ModelUnavailableError } from "../providers/resolve-model";
import { bearerToken } from "./bearer";

const TOKEN_PREFIX = "avgw_";

type Upstreams = { anthropic: string; openai: string; gemini?: string };

const DEFAULT_UPSTREAMS: Upstreams = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com",
};

const SEGMENTS = {
  anthropic: "anthropic",
  openai: "openai",
  gemini: "gemini",
  azure: "azure",
  "openai-compatible": "compatible",
} as const satisfies Record<Provider, string>;

// The only calls a runtime may make, per provider. Everything else (model lists, files, batches)
// stays unreachable.
const ALLOWED_PATHS: Record<Provider, readonly string[]> = {
  anthropic: ["/v1/messages"],
  openai: ["/responses", "/chat/completions"],
  // Gemini names the model in the path, so its calls are matched by `GEMINI_PATH` instead.
  gemini: [],
  azure: ["/responses", "/chat/completions"],
  "openai-compatible": ["/chat/completions"],
};

// Gemini's API: the model and the call are one path segment, `models/<id>:streamGenerateContent`.
const GEMINI_PATH = /^\/v1(?:beta)?\/models\/[^/:?]+:(generateContent|streamGenerateContent)$/;

const allowed = (provider: Provider, path: string) =>
  provider === "gemini" ? GEMINI_PATH.test(path) : ALLOWED_PATHS[provider].includes(path);

const PASS_REQUEST_HEADERS = ["accept", "anthropic-version", "anthropic-beta"];
const PASS_RESPONSE_HEADERS = ["content-type", "retry-after", "request-id", "x-request-id"];

type Grant = { model: ModelConfig; key: string | undefined };

// A thread's token is derived from this, so it stays the same from run to run and across a restart
// of the control plane. Without a configured secret it is random per process, and a thread that
// waits for an answer across a restart can no longer continue.
const TOKEN_SECRET =
  process.env.PROVIDER_ENCRYPTION_KEY ||
  process.env.BETTER_AUTH_SECRET ||
  randomBytes(32).toString("base64");

const tokenFor = (scope: string) =>
  `${TOKEN_PREFIX}${createHmac("sha256", TOKEN_SECRET).update(`run-gateway:${scope}`).digest("base64url")}`;

// Lets a runtime use a model without ever holding the provider key (decision 0008). Each run gets
// a token that maps to the sender's chosen provider, model and effort; the gateway adds the key,
// overwrites the model and effort in the request and streams the vendor's answer back untouched.
export class RunGateway {
  #grants = new Map<string, Grant>();
  #tokens = new Map<string, string>();

  constructor(private upstreams: Upstreams = DEFAULT_UPSTREAMS) {}

  // The key the model is reached with: the provider's own, else the environment's. Throws when
  // there is none, so a person is told before anything starts.
  #keyOf(config: ModelConfig) {
    const envKey = ENV_KEYS[config.provider];
    const key = config.apiKey ?? (envKey && process.env[envKey]);
    if (!key && config.provider === "azure") {
      throw new ModelUnavailableError("This Azure provider has no API key");
    }
    if (!key && envKey) throw new ModelUnavailableError(`${envKey} is not set`);
    return key;
  }

  // Throws when the model cannot be used (such as a missing environment key), and grants nothing.
  check(config: ModelConfig) {
    this.#keyOf(config);
  }

  // Throws when the model cannot be used (such as a missing environment key), before any run starts.
  // With a `scope` (a thread), the token is the same every time: a run parked on the agent's
  // question keeps the model client it was built with, so the run that answers must reach the
  // model with that token (decision 0021). The grant still lasts only as long as the run.
  issue(runId: string, config: ModelConfig, scope?: string): RunModel {
    const key = this.#keyOf(config);
    const token = scope
      ? tokenFor(scope)
      : `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
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

    try {
      const upstream = await fetch(this.#upstreamUrl(grant.model, upstreamPath, request), {
        method: "POST",
        headers: upstreamHeaders(request, grant),
        body: JSON.stringify(body),
        signal: request.signal,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: passHeaders(upstream.headers, PASS_RESPONSE_HEADERS),
      });
    } catch (error) {
      // A runner that went away (the run was stopped) is not a failure; anything else is told, since
      // the runner only sees a 502 and nothing says why the provider could not be reached.
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
      // The sender's model replaces the one the runtime named in the path; `alt=sse` is the only
      // query it may add (it is what makes the answer stream).
      const call = path.slice(path.lastIndexOf(":"));
      const id = encodeURIComponent(model.modelId ?? defaultModelId("gemini") ?? "");
      const sse = new URL(request.url).searchParams.get("alt") === "sse" ? "?alt=sse" : "";
      return `${this.upstreams.gemini ?? DEFAULT_UPSTREAMS.gemini}/v1beta/models/${id}${call}${sse}`;
    }
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
  else if (grant.model.provider === "gemini") headers.set("x-goog-api-key", grant.key);
  else headers.set("authorization", `Bearer ${grant.key}`);
  if (grant.model.provider === "azure") headers.set("api-key", grant.key);
  return headers;
}

const record = (value: unknown) =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

// The runtime picks neither the model nor the reasoning effort: the sender's choice wins.
function pin(body: Record<string, unknown>, model: ModelConfig, path: string) {
  // Gemini's request has no model field: it is in the URL, which `#upstreamUrl` sets.
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
