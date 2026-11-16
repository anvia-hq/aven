import type { BoatMachineType } from "@aven/protocol/types";

import type { BoatSandbox } from "./types";

const SANDBOX_ID = /^bx_[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

const AUTO_STOP_SECONDS = 2 * 60 * 60;

export const boatApiKey = () => process.env.AVEN_BOAT_API_KEY?.trim() || null;

export function autoStopSeconds() {
  const configured = Number(process.env.AVEN_BOAT_AUTO_STOP_SECONDS);

  return Number.isInteger(configured) && configured >= 60 ? configured : AUTO_STOP_SECONDS;
}

const REQUEST_TIMEOUT_MS = 60_000;

export const BOAT_API_BASE = "https://boat.dev/api/v1";

export class BoatApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function boatApiBase(configured = process.env.AVEN_BOAT_API_BASE) {
  const base = (configured || BOAT_API_BASE).replace(/\/$/, "");
  const url = new URL(base);

  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new BoatApiError(0, "invalid_base", "AVEN_BOAT_API_BASE must be an http(s) URL");

  return base;
}

const redact = (text: string) =>
  text.replaceAll(/boat_[A-Za-z0-9_-]+/g, "boat_…").replaceAll(/avrt_[A-Za-z0-9_-]+/g, "avrt_…");

function safeText(text: string) {
  const cleaned = redact(text).trim();

  if (cleaned.length === 0 || cleaned.length > 240) return "";

  return cleaned;
}

function publicMessage(status: number, code: string, message: string) {
  const safe = safeText(message);

  if (status === 401) return "Boat rejected this API key";

  if (status === 402) return safe || "Boat needs a payment method before it can start a sandbox";

  if (status === 403) return safe || "This boat account cannot start a sandbox of that size";

  if (status === 404) return "The boat sandbox is gone";

  if (status === 429) return safe || "Boat's rate limit was reached; try again shortly";

  if (status === 503) return safe || "Boat has no machine ready; try again shortly";

  if (status === 0) return "Could not reach boat.dev";

  return safe || `Boat request failed (${status}${code ? ` ${code}` : ""})`;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function failureOf(parsed: unknown, status: number) {
  const body = asRecord(parsed);
  const nested = asRecord(body?.error);
  const code = asString(body?.code) || asString(nested?.code);
  const message = asString(body?.message) || asString(nested?.message);
  return new BoatApiError(status, code, publicMessage(status, code, message));
}

function sandboxOf(parsed: unknown): BoatSandbox {
  const body = asRecord(parsed);
  const sandbox = asRecord(body?.sandbox);
  const id = asString(sandbox?.id);

  if (!SANDBOX_ID.test(id))
    throw new BoatApiError(0, "invalid_sandbox_id", "Boat returned an unexpected sandbox id");

  const expired = sandbox?.dataExpiredAt;
  return {
    id,
    state: asString(sandbox?.state),
    dataExpiredAt: typeof expired === "string" ? expired : null,
  };
}

export class BoatClient {
  constructor(
    private fetchFn: typeof fetch = fetch,
    private base = boatApiBase(),
  ) {}

  async createSandbox(apiKey: string, input: { runtimeId: string; machineType: BoatMachineType }) {
    return sandboxOf(
      await this.#request(
        "POST",
        "/sandboxes",
        apiKey,
        {
          name: `aven-${input.runtimeId}`.slice(0, 120),
          type: input.machineType,
          ttlSeconds: autoStopSeconds(),
          noEnv: true,
          visibility: "private",
          labels: { avenRuntimeId: input.runtimeId },
        },
        { "Idempotency-Key": `aven-${input.runtimeId}` },
      ),
    );
  }

  getSandbox(apiKey: string, sandboxId: string) {
    return this.#sandbox("GET", sandboxId, apiKey);
  }

  async resume(apiKey: string, sandboxId: string) {
    await this.#request("POST", `${this.#sandboxPath(sandboxId)}/resume`, apiKey, {
      ttlSeconds: autoStopSeconds(),
    });
  }

  stop(apiKey: string, sandboxId: string) {
    return this.#request("POST", `${this.#sandboxPath(sandboxId)}/stop`, apiKey);
  }

  extend(apiKey: string, sandboxId: string) {
    return this.#request("PATCH", this.#sandboxPath(sandboxId), apiKey, {
      ttlSeconds: autoStopSeconds(),
    });
  }

  deleteSandbox(apiKey: string, sandboxId: string) {
    return this.#request("DELETE", this.#sandboxPath(sandboxId), apiKey, undefined, {
      "X-Ascii-Confirm-Delete": sandboxId,
    });
  }

  writeFile(apiKey: string, sandboxId: string, path: string, content: string) {
    return this.#request("PUT", `${this.#sandboxPath(sandboxId)}/files`, apiKey, {
      path,
      content,
      encoding: "utf8",
    });
  }

  async command(apiKey: string, sandboxId: string, command: string, detached = false) {
    const parsed = await this.#request(
      "POST",
      `${this.#sandboxPath(sandboxId)}/commands`,
      apiKey,
      detached ? { command, detached: true } : { command },
    );
    const body = asRecord(parsed);
    const exitCode = body?.exitCode;

    if (body?.type === "command.finished" && typeof exitCode === "number" && exitCode !== 0)
      throw new BoatApiError(
        200,
        "command_failed",
        safeText(asString(body.stderr) || asString(body.stdout)) || "The runner did not start",
      );
  }

  async #sandbox(method: "GET", sandboxId: string, apiKey: string) {
    return sandboxOf(await this.#request(method, this.#sandboxPath(sandboxId), apiKey));
  }

  #sandboxPath(sandboxId: string) {
    if (!SANDBOX_ID.test(sandboxId))
      throw new BoatApiError(0, "invalid_sandbox_id", "The saved boat sandbox id is not usable");

    return `/sandboxes/${sandboxId}`;
  }

  async #request(
    method: string,
    path: string,
    apiKey: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) {
    const url = `${this.base}${path}`;
    let response: Response;

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    };

    if (body !== undefined) requestHeaders["Content-Type"] = "application/json";

    if (headers) Object.assign(requestHeaders, headers);

    try {
      response = await this.fetchFn(url, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new BoatApiError(0, "network", publicMessage(0, "network", ""));
    }

    const text = await response.text();
    let parsed: unknown = {};

    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new BoatApiError(
          response.status,
          "invalid_json",
          "Boat returned a response that is not JSON",
        );
      }
    }

    const record = asRecord(parsed);

    if (!response.ok || record?.ok !== true) throw failureOf(parsed, response.status);

    return parsed;
  }
}
