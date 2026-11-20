import { SAVED_SNAPSHOT_NAME } from "@aven/protocol/runtime-wire";

import type { SpacesMachineType, SpacesSavedSnapshot, SpacesSandbox } from "./types";
import { spacesAutoStopSeconds } from "./config";

const SANDBOX_ID = /^bx_[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

const REQUEST_TIMEOUT_MS = 60_000;

export class SpacesApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const redact = (text: string) =>
  text.replaceAll(/sk_[A-Za-z0-9_-]+/g, "sk_…").replaceAll(/avrt_[A-Za-z0-9_-]+/g, "avrt_…");

function safeText(text: string) {
  const cleaned = redact(text).trim();

  return cleaned.length === 0 || cleaned.length > 240 ? "" : cleaned;
}

function publicMessage(status: number, message: string) {
  const safe = safeText(message);

  if (status === 401) return "Spaces rejected this API key";

  if (status === 404) return "The spaces sandbox is gone";

  if (status === 0) return "Could not reach the spaces server";

  return safe || `Spaces request failed (${status})`;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  return value as Record<string, unknown>;
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");

function failureOf(parsed: unknown, status: number) {
  const body = asRecord(parsed);
  const nested = asRecord(body?.error);
  const code = asString(body?.code) || asString(nested?.code);
  const message = asString(body?.message) || asString(nested?.message);
  return new SpacesApiError(status, code, publicMessage(status, message));
}

function sandboxOf(parsed: unknown): SpacesSandbox {
  const sandbox = asRecord(asRecord(parsed)?.sandbox);
  const id = asString(sandbox?.id);

  if (!SANDBOX_ID.test(id))
    throw new SpacesApiError(0, "invalid_sandbox_id", "Spaces returned an unexpected sandbox id");

  return { id, state: asString(sandbox?.state) };
}

function savedSnapshotOf(parsed: unknown): SpacesSavedSnapshot {
  const snapshot = asRecord(asRecord(parsed)?.snapshot);
  const name = asString(snapshot?.name);
  const status = asString(snapshot?.status);

  if (!SAVED_SNAPSHOT_NAME.test(name) || !["saving", "ready", "failed"].includes(status))
    throw new SpacesApiError(
      0,
      "invalid_saved_snapshot",
      "Spaces returned an unexpected saved snapshot",
    );

  const error = asString(snapshot?.error);
  return {
    name,
    status: status as SpacesSavedSnapshot["status"],
    error: error || null,
  };
}

export class SpacesClient {
  constructor(
    private base: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async createSandbox(
    apiKey: string,
    input: { runtimeId: string; machineType: SpacesMachineType; from?: string | null },
  ) {
    const body: Record<string, unknown> = {
      name: `aven-${input.runtimeId}`.slice(0, 120),
      type: input.machineType,
      ttlSeconds: spacesAutoStopSeconds(),
      labels: { avenRuntimeId: input.runtimeId },
    };

    if (input.from) body.from = input.from;

    return sandboxOf(
      await this.#request("POST", "/sandboxes", apiKey, body, {
        "Idempotency-Key": `aven-${input.runtimeId}`,
      }),
    );
  }

  async saveSnapshot(apiKey: string, sandboxId: string, name: string) {
    return savedSnapshotOf(
      await this.#request("POST", "/saved-snapshots", apiKey, { sandboxId, name }),
    );
  }

  async getSavedSnapshot(apiKey: string, name: string) {
    return savedSnapshotOf(await this.#request("GET", this.#savedPath(name), apiKey));
  }

  async deleteSavedSnapshot(apiKey: string, name: string) {
    await this.#request("DELETE", this.#savedPath(name), apiKey);
  }

  #savedPath(name: string) {
    if (!SAVED_SNAPSHOT_NAME.test(name))
      throw new SpacesApiError(0, "invalid_snapshot_name", "The saved snapshot name is not usable");

    return `/saved-snapshots/${name}`;
  }

  async getSandbox(apiKey: string, sandboxId: string) {
    return sandboxOf(await this.#request("GET", this.#path(sandboxId), apiKey));
  }

  async resume(apiKey: string, sandboxId: string) {
    await this.#request("POST", `${this.#path(sandboxId)}/resume`, apiKey, {
      ttlSeconds: spacesAutoStopSeconds(),
    });
  }

  async stop(apiKey: string, sandboxId: string) {
    await this.#request("POST", `${this.#path(sandboxId)}/stop`, apiKey, {});
  }

  async extend(apiKey: string, sandboxId: string, ttlSeconds = spacesAutoStopSeconds()) {
    await this.#request("PATCH", this.#path(sandboxId), apiKey, {
      ttlSeconds,
    });
  }

  async deleteSandbox(apiKey: string, sandboxId: string) {
    await this.#request("DELETE", this.#path(sandboxId), apiKey);
  }

  async writeFile(apiKey: string, sandboxId: string, path: string, content: string) {
    await this.#request("PUT", `${this.#path(sandboxId)}/files`, apiKey, {
      path,
      content,
      encoding: "utf8",
    });
  }

  async command(
    apiKey: string,
    sandboxId: string,
    command: string,
    options: { detached?: boolean; timeoutSeconds?: number } = {},
  ) {
    const request: { command: string; detached?: boolean; timeoutSeconds?: number } = { command };

    if (options.detached) request.detached = true;

    if (options.timeoutSeconds !== undefined) request.timeoutSeconds = options.timeoutSeconds;

    const parsed = await this.#request(
      "POST",
      `${this.#path(sandboxId)}/commands`,
      apiKey,
      request,
    );
    const body = asRecord(parsed);
    const exitCode = body?.exitCode;

    if (body?.type === "command.finished" && typeof exitCode === "number" && exitCode !== 0)
      throw new SpacesApiError(
        200,
        "command_failed",
        safeText(asString(body.stderr) || asString(body.stdout)) || "The command failed",
      );
  }

  #path(sandboxId: string) {
    if (!SANDBOX_ID.test(sandboxId))
      throw new SpacesApiError(
        0,
        "invalid_sandbox_id",
        "The saved spaces sandbox id is not usable",
      );

    return `/sandboxes/${sandboxId}`;
  }

  async #request(
    method: string,
    path: string,
    apiKey: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) {
    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...headers,
    };

    if (body !== undefined) requestHeaders["Content-Type"] = "application/json";

    let response: Response;

    try {
      response = await this.fetchFn(`${this.base}${path}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new SpacesApiError(0, "network", publicMessage(0, ""));
    }

    const text = await response.text();
    let parsed: unknown = {};

    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new SpacesApiError(
          response.status,
          "invalid_json",
          "Spaces returned a response that is not JSON",
        );
      }
    }

    if (!response.ok || asRecord(parsed)?.ok !== true) throw failureOf(parsed, response.status);

    return parsed;
  }
}
