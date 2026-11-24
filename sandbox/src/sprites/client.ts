import { spritesApiBase } from "./config";
import type { SpritesExecResult, SpritesSprite } from "./types";

const SPRITE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const REQUEST_TIMEOUT_MS = 120_000;

const MIN_TIMEOUT_MS = 1_000;

const MAX_TIMEOUT_MS = 2_147_483_647;

const SHELL = "bash";

const SHELL_FLAG = "-lc";

export class SpritesApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function safeText(text: string) {
  const cleaned = text.replaceAll(/avrt_[A-Za-z0-9_-]+/g, "avrt_…").trim();

  if (cleaned.length === 0 || cleaned.length > 240) return "";

  return cleaned;
}

function publicMessage(status: number, message: string) {
  const safe = safeText(message);

  if (status === 401) return "Sprites rejected this API token";

  if (status === 402) return safe || "The Sprites account needs a payment method";

  if (status === 403) return safe || "This Sprites account cannot run that computer";

  if (status === 404) return "The Sprite is gone";

  if (status === 409) return safe || "A Sprite with that name already exists";

  if (status === 429) return safe || "The Sprites limit was reached; try again shortly";

  if (status === 0) return "Could not reach api.sprites.dev";

  return safe || `Sprites request failed (${status})`;
}

function payloadOf(body: unknown) {
  if (body === undefined) return undefined;

  if (typeof body === "string") return body;

  return JSON.stringify(body);
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  return value as Record<string, unknown>;
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");

function spriteOf(parsed: unknown): SpritesSprite {
  const body = asRecord(parsed);
  const name = asString(body?.name);
  const id = asString(body?.id);

  if (!SPRITE_NAME.test(name) || id === "")
    throw new SpritesApiError(0, "invalid_sprite", "Sprites returned an unexpected Sprite");

  return {
    name,
    id,
    status: asString(body?.status) || "cold",
    url: asString(body?.url) || null,
  };
}

function exitCodeOf(value: unknown) {
  const code = typeof value === "number" ? value : Number(value);

  return Number.isInteger(code) ? code : 0;
}

function resultOf(body: Record<string, unknown>): SpritesExecResult {
  return {
    stdout: asString(body.stdout),
    stderr: asString(body.stderr),
    exitCode: exitCodeOf(body.exitCode ?? body.exit_code),
  };
}

function streamedResult(text: string): SpritesExecResult | undefined {
  const lines = text.split("\n").filter((line) => line.trim().startsWith("{"));

  if (lines.length === 0) return undefined;

  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  let seen = false;

  for (const line of lines) {
    let event: Record<string, unknown> | undefined;

    try {
      event = asRecord(JSON.parse(line));
    } catch {
      return undefined;
    }

    if (!event) return undefined;

    seen = true;
    const data = asString(event.data);
    const type = asString(event.type);

    if (type === "error") stderr += data;
    else if (data !== "") stdout += `${data}\n`;

    if (event.exitCode !== undefined || event.exit_code !== undefined)
      exitCode = exitCodeOf(event.exitCode ?? event.exit_code);
  }

  return seen ? { stdout, stderr, exitCode } : undefined;
}

export function execResultOf(text: string): SpritesExecResult {
  try {
    const parsed = asRecord(JSON.parse(text));

    if (parsed && (parsed.stdout !== undefined || parsed.stderr !== undefined))
      return resultOf(parsed);
  } catch {
    const streamed = streamedResult(text);

    if (streamed) return streamed;

    return { stdout: text, stderr: "", exitCode: 0 };
  }

  return streamedResult(text) ?? { stdout: text, stderr: "", exitCode: 0 };
}

function clampTimeoutMs(timeoutMs: number) {
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(timeoutMs)));
}

export class SpritesClient {
  constructor(
    private fetchFn: typeof fetch = fetch,
    private base = spritesApiBase(),
  ) {}

  async create(apiKey: string, name: string) {
    return spriteOf(
      await this.#request("POST", "/v1/sprites", apiKey, {
        name: this.#nameOf(name),
        url_settings: { auth: "sprite" },
      }),
    );
  }

  async get(apiKey: string, name: string) {
    return spriteOf(await this.#request("GET", this.#spritePath(name), apiKey));
  }

  async remove(apiKey: string, name: string) {
    await this.#request("DELETE", this.#spritePath(name), apiKey);
  }

  async writeFile(
    apiKey: string,
    name: string,
    path: string,
    content: string,
    options: { mode?: string; workingDir?: string } = {},
  ) {
    const query = new URLSearchParams({
      path,
      workingDir: options.workingDir ?? "/",
      mkdir: "true",
    });

    if (options.mode) query.set("mode", options.mode);

    await this.#request(
      "PUT",
      `${this.#spritePath(name)}/fs/write?${query.toString()}`,
      apiKey,
      content,
      REQUEST_TIMEOUT_MS,
      "application/octet-stream",
    );
  }

  async run(
    apiKey: string,
    name: string,
    command: string,
    options: { dir?: string; timeoutMs?: number } = {},
  ): Promise<SpritesExecResult> {
    const query = new URLSearchParams();

    for (const arg of [SHELL, SHELL_FLAG, command]) query.append("cmd", arg);

    if (options.dir) query.set("dir", options.dir);

    const timeoutMs = clampTimeoutMs(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    const text = await this.#requestText(
      "POST",
      `${this.#spritePath(name)}/exec?${query.toString()}`,
      apiKey,
      timeoutMs,
    );
    return execResultOf(text);
  }

  #spritePath(name: string) {
    return `/v1/sprites/${encodeURIComponent(this.#nameOf(name))}`;
  }

  #nameOf(name: string) {
    if (!SPRITE_NAME.test(name))
      throw new SpritesApiError(0, "invalid_sprite_name", "The saved Sprite name is not usable");

    return name;
  }

  async #request(
    method: string,
    path: string,
    apiKey: string,
    body?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
    contentType = "application/json",
  ) {
    const payload = payloadOf(body);
    const text = await this.#requestText(method, path, apiKey, timeoutMs, payload, contentType);

    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      throw new SpritesApiError(0, "invalid_json", "Sprites returned a response that is not JSON");
    }
  }

  async #requestText(
    method: string,
    path: string,
    apiKey: string,
    timeoutMs = REQUEST_TIMEOUT_MS,
    body?: string,
    contentType = "application/json",
  ) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    };

    if (body !== undefined) headers["Content-Type"] = contentType;

    let response: Response;

    try {
      response = await this.fetchFn(`${this.base}${path}`, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new SpritesApiError(0, "network", publicMessage(0, ""));
    }

    const text = await response.text();

    if (!response.ok) throw failureOf(text, response.status);

    return text;
  }
}

function failureOf(text: string, status: number) {
  let message = "";
  let code = "";

  try {
    const body = asRecord(JSON.parse(text));
    message = asString(body?.error) || asString(body?.message);
    code = asString(body?.code);
  } catch {
    message = text;
  }

  return new SpritesApiError(status, code, publicMessage(status, message));
}
