/** The token in an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(headers: Headers) {
  return headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? null;
}
