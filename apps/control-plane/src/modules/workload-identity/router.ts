import { Elysia, status } from "elysia";

import { bearerToken } from "../runtimes/bearer";
import { runIdentities } from "./grants";
import { issuer } from "./issuer";
import { mintTokenBody } from "./schema";

export const workloadIdentityRouter = new Elysia({ prefix: "/workload-identity" })
  .get("/.well-known/openid-configuration", () => issuer.discovery())
  .get("/jwks.json", () => issuer.jwks())
  .post(
    "/token",
    async ({ request, body }) => {
      const credential = bearerToken(request.headers);
      const token = credential && (await runIdentities.mint(credential, body));
      return token ? { token } : status(401, "Unauthorized");
    },
    { body: mintTokenBody },
  );
