import { Elysia, status } from "elysia";

import { bearerToken } from "../runtimes/bearer";
import { runIdentities } from "./grants";
import { issuer } from "./issuer";
import { mintTokenBody } from "./schema";

export const workloadIdentityRouter = new Elysia({ prefix: "/workload-identity" })
  // What a provider fetches to trust the issuer (decision 0049); public, as an issuer's must be.
  .get("/.well-known/openid-configuration", () => issuer.discovery())
  .get("/jwks.json", () => issuer.jwks())
  // Authenticated by a run's own credential, not a session: it is the sandbox that asks.
  .post(
    "/token",
    async ({ request, body }) => {
      const credential = bearerToken(request.headers);
      const token = credential && (await runIdentities.mint(credential, body));
      return token ? { token } : status(401, "Unauthorized");
    },
    { body: mintTokenBody },
  );
