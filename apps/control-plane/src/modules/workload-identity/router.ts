import { Elysia } from "elysia";

import { issuer } from "./issuer";

// What a provider fetches to trust the issuer (decision 0049); public, as an issuer's must be.
export const workloadIdentityRouter = new Elysia({ prefix: "/workload-identity" })
  .get("/.well-known/openid-configuration", () => issuer.discovery())
  .get("/jwks.json", () => issuer.jwks());
