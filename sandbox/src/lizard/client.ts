import { createHash } from "node:crypto";

import {
  LIZARD_DEFAULT_REGION,
  LIZARD_DEFAULT_TEMPLATE,
  lizardApiBase,
  lizardAutoStopSeconds,
  lizardSizeOf,
} from "./config";
import type {
  LizardExecResult,
  LizardMachineType,
  LizardSandbox,
  LizardSavedSnapshot,
} from "./types";

const SANDBOX_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const SNAPSHOT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

const ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;

const REQUEST_TIMEOUT_MS = 120_000;

const SNAPSHOT_TIMEOUT_MS = 11 * 60_000;

const MIN_TIMEOUT_MS = 1_000;

const MAX_TIMEOUT_MS = 2_147_483_647;

const projectIdCache = new Map<string, string>();

export class LizardApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const redact = (text: string) =>
  text.replaceAll(/liz_[A-Za-z0-9_-]+/g, "liz_…").replaceAll(/avrt_[A-Za-z0-9_-]+/g, "avrt_…");

function safeText(text: string) {
  const cleaned = redact(text).trim();

  return cleaned.length === 0 || cleaned.length > 240 ? "" : cleaned;
}

function publicMessage(status: number, code: string, message: string) {
  const safe = safeText(message);

  if (status === 401) return "Lizard rejected this API key";

  if (status === 402) return safe || "Lizard needs a payment method before it can start a sandbox";

  if (status === 403) return safe || "This Lizard account cannot start that sandbox";

  if (status === 404) return "The Lizard sandbox is gone";

  if (status === 429) return safe || "Lizard's sandbox limit was reached; try again shortly";

  if (status === 503) return safe || "Lizard has no machine ready; try again shortly";

  if (status === 0) return "Could not reach lizard.build";

  return safe || `Lizard request failed (${status}${code ? ` ${code}` : ""})`;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  return value as Record<string, unknown>;
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function failureOf(parsed: unknown, status: number) {
  const body = asRecord(parsed);
  const rawError = asString(body?.error);
  const errorIsCode = rawError !== "" && ERROR_CODE.test(rawError);
  const code = asString(body?.code) || (errorIsCode ? rawError : "");
  const message =
    (errorIsCode ? asString(body?.message) || rawError : rawError || asString(body?.message)) || "";
  return new LizardApiError(status, code, publicMessage(status, code, message), body);
}

function sandboxOf(parsed: unknown): LizardSandbox {
  const body = asRecord(parsed);
  const id = asString(body?.sandboxId) || asString(body?.id);

  if (!SANDBOX_ID.test(id))
    throw new LizardApiError(0, "invalid_sandbox_id", "Lizard returned an unexpected sandbox id");

  return {
    id,
    state: asString(body?.status) || "running",
    pauseError: asString(body?.pauseError) || null,
    region: asString(body?.region) || null,
    size: asString(body?.size) || null,
    pricePerHour: asNumber(body?.pricePerHour),
  };
}

function snapshotStatusOf(raw: string): LizardSavedSnapshot["status"] {
  if (raw === "building" || raw === "warming") return "saving";

  if (raw === "ready") return "ready";

  return "failed";
}

function savedSnapshotOf(parsed: unknown): LizardSavedSnapshot {
  const body = asRecord(parsed);
  const id = asString(body?.id);
  const rawStatus = asString(body?.status);

  if (!SNAPSHOT_ID.test(id) || !rawStatus)
    throw new LizardApiError(
      0,
      "invalid_saved_snapshot",
      "Lizard returned an unexpected saved snapshot",
    );

  const error = asString(body?.error);
  return {
    name: id,
    status: snapshotStatusOf(rawStatus),
    error: error || null,
  };
}

function clampTimeoutMs(timeoutMs: number) {
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(timeoutMs)));
}

function cacheKey(base: string, apiKey: string, ref: string) {
  const hash = createHash("sha256").update(apiKey).digest("hex");
  return `${base}\0${hash}\0${ref}`;
}

export function clearLizardProjectCache() {
  projectIdCache.clear();
}

export class LizardClient {
  constructor(
    private fetchFn: typeof fetch = fetch,
    private base = lizardApiBase(),
  ) {}

  async resolveProjectId(apiKey: string, projectRef?: string) {
    const ref = projectRef?.trim() ?? "";
    const key = cacheKey(this.base, apiKey, ref);
    const cached = projectIdCache.get(key);

    if (cached) return cached;

    const parsed = await this.#request("GET", "/api/projects", apiKey);

    if (!Array.isArray(parsed))
      throw new LizardApiError(0, "invalid_projects", "Lizard returned an unexpected project list");

    const projects = parsed.flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    });

    if (!ref) {
      if (projects.length === 1) {
        const onlyId = asString(projects[0]?.id);

        if (onlyId) {
          projectIdCache.set(key, onlyId);
          return onlyId;
        }
      }

      if (projects.length === 0)
        throw new LizardApiError(
          0,
          "missing_project",
          "This Lizard API key has no project. Create a project on lizard.build first",
        );

      throw new LizardApiError(
        0,
        "ambiguous_project",
        "Set a Lizard project in Platform Settings because this account has multiple projects",
      );
    }

    const lower = ref.toLowerCase();
    const matches = projects.filter(
      (project) =>
        asString(project.id).toLowerCase() === lower ||
        asString(project.slug).toLowerCase() === lower ||
        asString(project.name).toLowerCase() === lower,
    );

    if (matches.length > 1)
      throw new LizardApiError(
        0,
        "ambiguous_project",
        `Lizard project "${ref}" matches multiple projects; enter the project ID instead`,
      );

    const matchedId = asString(matches[0]?.id);

    if (!matchedId)
      throw new LizardApiError(
        0,
        "project_not_found",
        `Lizard project "${ref}" was not found for this API key`,
      );

    projectIdCache.set(key, matchedId);
    return matchedId;
  }

  async createSandbox(
    apiKey: string,
    input: {
      runtimeId: string;
      machineType: LizardMachineType;
      from?: string | null;
      project?: string;
      region?: string;
      template?: string;
      timeoutMs?: number;
    },
  ) {
    const timeoutMs = clampTimeoutMs(input.timeoutMs ?? lizardAutoStopSeconds() * 1_000);

    if (input.from) return this.#createFromSnapshot(apiKey, input.from, input, timeoutMs);

    const projectId = await this.resolveProjectId(apiKey, input.project);
    const defaultRegion = !input.region;
    const requestedRegion = input.region || LIZARD_DEFAULT_REGION;
    const bodyFor = (region: string | undefined, lifeMs: number) => ({
      template: input.template || LIZARD_DEFAULT_TEMPLATE,
      size: lizardSizeOf(input.machineType),
      timeoutMs: lifeMs,
      projectId,
      metadata: { avenRuntimeId: input.runtimeId },
      region,
    });

    const send = (region: string | undefined, lifeMs: number) =>
      this.#request("POST", "/api/sandboxes", apiKey, bodyFor(region, lifeMs));

    try {
      return sandboxOf(await send(requestedRegion, timeoutMs));
    } catch (error) {
      if (
        defaultRegion &&
        error instanceof LizardApiError &&
        error.status === 503 &&
        error.code === "region_unavailable"
      )
        return sandboxOf(await send(undefined, timeoutMs));

      if (
        error instanceof LizardApiError &&
        error.status === 403 &&
        error.code === "TRIAL_SANDBOX_LIFETIME"
      ) {
        const maxTimeoutMs = asNumber(error.details?.maxTimeoutMs);

        if (maxTimeoutMs && maxTimeoutMs >= MIN_TIMEOUT_MS && maxTimeoutMs < timeoutMs)
          return sandboxOf(await send(requestedRegion, clampTimeoutMs(maxTimeoutMs)));
      }

      throw error;
    }
  }

  async #createFromSnapshot(
    apiKey: string,
    snapshotId: string,
    input: { runtimeId: string; project?: string },
    timeoutMs: number,
  ) {
    const snapshot = asRecord(await this.#request("GET", this.#snapshotPath(snapshotId), apiKey));
    const projectId =
      asString(snapshot?.projectId) || (await this.resolveProjectId(apiKey, input.project));
    const region = asString(snapshot?.region) || undefined;
    const send = (lifeMs: number) =>
      this.#request("POST", "/api/sandboxes", apiKey, {
        snapshotId,
        projectId,
        region,
        timeoutMs: lifeMs,
        metadata: { avenRuntimeId: input.runtimeId },
      });

    try {
      return sandboxOf(await send(timeoutMs));
    } catch (error) {
      if (
        error instanceof LizardApiError &&
        error.status === 403 &&
        error.code === "TRIAL_SANDBOX_LIFETIME"
      ) {
        const maxTimeoutMs = asNumber(error.details?.maxTimeoutMs);

        if (maxTimeoutMs && maxTimeoutMs >= MIN_TIMEOUT_MS && maxTimeoutMs < timeoutMs)
          return sandboxOf(await send(clampTimeoutMs(maxTimeoutMs)));
      }

      throw error;
    }
  }

  async getSandbox(apiKey: string, sandboxId: string) {
    return sandboxOf(await this.#request("GET", this.#sandboxPath(sandboxId), apiKey));
  }

  async pause(apiKey: string, sandboxId: string) {
    await this.#request("POST", `${this.#sandboxPath(sandboxId)}/pause`, apiKey);
  }

  async resume(apiKey: string, sandboxId: string) {
    await this.#request("POST", `${this.#sandboxPath(sandboxId)}/resume`, apiKey);
  }

  async extend(apiKey: string, sandboxId: string, ttlSeconds = lizardAutoStopSeconds()) {
    const timeoutMs = clampTimeoutMs(ttlSeconds * 1_000);

    try {
      await this.#request("POST", `${this.#sandboxPath(sandboxId)}/timeout`, apiKey, {
        timeoutMs,
      });
    } catch (error) {
      if (
        error instanceof LizardApiError &&
        error.status === 403 &&
        error.code === "TRIAL_SANDBOX_LIFETIME"
      ) {
        const latest = asString(error.details?.latestExpiresAt);
        const remainingMs = latest ? Date.parse(latest) - Date.now() - 5_000 : Number.NaN;

        if (Number.isFinite(remainingMs) && remainingMs >= MIN_TIMEOUT_MS) {
          await this.#request("POST", `${this.#sandboxPath(sandboxId)}/timeout`, apiKey, {
            timeoutMs: clampTimeoutMs(remainingMs),
          });
          return;
        }
      }

      throw error;
    }
  }

  async deleteSandbox(apiKey: string, sandboxId: string) {
    await this.#request("DELETE", this.#sandboxPath(sandboxId), apiKey);
  }

  async writeFile(apiKey: string, sandboxId: string, path: string, content: string) {
    await this.#request("POST", `${this.#sandboxPath(sandboxId)}/files`, apiKey, {
      path,
      content,
    });
  }

  async exec(
    apiKey: string,
    sandboxId: string,
    cmd: string,
    options: { workdir?: string; timeoutMs?: number } = {},
  ): Promise<LizardExecResult> {
    const requestTimeoutMs = options.timeoutMs
      ? Math.max(REQUEST_TIMEOUT_MS, options.timeoutMs + 15_000)
      : REQUEST_TIMEOUT_MS;
    const parsed = await this.#request(
      "POST",
      `${this.#sandboxPath(sandboxId)}/exec`,
      apiKey,
      {
        cmd,
        workdir: options.workdir,
        timeoutMs: options.timeoutMs,
      },
      requestTimeoutMs,
    );
    const body = asRecord(parsed);
    const stdout = asString(body?.stdout);
    const stderr = asString(body?.stderr);
    const exitCode = typeof body?.exitCode === "number" ? body.exitCode : 0;

    if (exitCode !== 0)
      throw new LizardApiError(
        200,
        "command_failed",
        safeText(stderr || stdout) || "The command failed",
      );

    return { stdout, stderr, exitCode };
  }

  async saveSnapshot(apiKey: string, sandboxId: string, name: string) {
    return savedSnapshotOf(
      await this.#request(
        "POST",
        `${this.#sandboxPath(sandboxId)}/snapshot`,
        apiKey,
        { name },
        SNAPSHOT_TIMEOUT_MS,
      ),
    );
  }

  async getSavedSnapshot(apiKey: string, snapshotId: string) {
    return savedSnapshotOf(await this.#request("GET", this.#snapshotPath(snapshotId), apiKey));
  }

  async deleteSavedSnapshot(apiKey: string, snapshotId: string) {
    await this.#request("DELETE", this.#snapshotPath(snapshotId), apiKey);
  }

  #sandboxPath(sandboxId: string) {
    if (!SANDBOX_ID.test(sandboxId))
      throw new LizardApiError(
        0,
        "invalid_sandbox_id",
        "The saved Lizard sandbox id is not usable",
      );

    return `/api/sandboxes/${encodeURIComponent(sandboxId)}`;
  }

  #snapshotPath(snapshotId: string) {
    if (!SNAPSHOT_ID.test(snapshotId))
      throw new LizardApiError(
        0,
        "invalid_snapshot_id",
        "The saved Lizard snapshot id is not usable",
      );

    return `/api/sandbox-snapshots/${encodeURIComponent(snapshotId)}`;
  }

  async #request(
    method: string,
    path: string,
    apiKey: string,
    body?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    const headers: Record<string, string> = {
      "X-API-Key": apiKey,
      Accept: "application/json",
    };

    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;

    try {
      response = await this.fetchFn(`${this.base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new LizardApiError(0, "network", publicMessage(0, "network", ""));
    }

    if (response.status === 204) return {};

    const text = await response.text();
    let parsed: unknown = {};

    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (!response.ok) throw failureOf({ message: text }, response.status);

        throw new LizardApiError(
          response.status,
          "invalid_json",
          "Lizard returned a response that is not JSON",
        );
      }
    }

    if (!response.ok) throw failureOf(parsed, response.status);

    return parsed;
  }
}
