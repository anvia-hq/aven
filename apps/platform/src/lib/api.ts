export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// The backend answers expected errors with a short plain-text message; surface it as the error.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = text.length > 0 && text.length < 300 ? text : `Request to ${path} failed`;
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export function postJson<T>(path: string, body: unknown, method = "POST") {
  return api<T>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
