import { toast } from "@/components/toast";

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const UNREACHABLE = "Could not reach the server";

// What to tell the user about a failed request: the backend's own message, else a generic one.
export function errorMessage(failure: unknown) {
  return failure instanceof ApiError ? failure.message : UNREACHABLE;
}

// Runs a request and toasts its failure under `failureTitle`. Null on failure (already toasted).
export async function attempt<T>(
  failureTitle: string,
  request: () => Promise<T>,
): Promise<T | null> {
  try {
    return await request();
  } catch (failure) {
    toast.add({ title: failureTitle, description: errorMessage(failure), type: "error" });
    return null;
  }
}

async function send(path: string, init?: RequestInit) {
  try {
    return await fetch(`/api${path}`, { credentials: "include", ...init });
  } catch {
    throw new ApiError(0, UNREACHABLE);
  }
}

// The backend answers expected errors with a short plain-text message; surface it as the error.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = text.length > 0 && text.length < 300 ? text : `Request to ${path} failed`;
    throw new ApiError(res.status, message);
  }
  // A 204 has no body; callers of such endpoints type `T` as void.
  const body = await res.text();
  return (body.length > 0 ? JSON.parse(body) : undefined) as T;
}

// A WebSocket URL for `path` on the backend, through the platform's /api proxy, which carries
// WebSockets.
export function wsUrl(path: string) {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/api${path}`;
}

export function postJson<T>(path: string, body: unknown, method = "POST") {
  return api<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
