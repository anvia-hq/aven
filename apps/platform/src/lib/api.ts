export async function api<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Request to ${path} failed with ${res.status}`);
  return res.json() as Promise<T>;
}
