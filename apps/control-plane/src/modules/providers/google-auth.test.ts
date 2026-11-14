import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  createGoogleTokens,
  GoogleAuthError,
  isGoogleCredential,
  parseServiceAccount,
} from "./google-auth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credential = JSON.stringify({
  type: "service_account",
  client_email: "agent@my-project-123.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  private_key_id: "abcdef123456",
  token_uri: "https://evil.example.com/token",
});

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

describe("a Vertex AI credential", () => {
  test("is a service account's JSON key or something shaped like a token", () => {
    expect(parseServiceAccount(credential)?.client_email).toContain("@my-project-123");
    expect(isGoogleCredential(credential)).toBe(true);
    expect(isGoogleCredential("ya29.a0-access-token")).toBe(true);
    expect(isGoogleCredential('{"type":"authorized_user"}')).toBe(false);
    expect(isGoogleCredential("{not json")).toBe(false);
    expect(isGoogleCredential("two words")).toBe(false);
  });
});

describe("createGoogleTokens", () => {
  test("a token is used as it is", async () => {
    const accessToken = createGoogleTokens((async () => {
      throw new Error("no call expected");
    }) as unknown as typeof fetch);
    expect(await accessToken(" ya29.pasted ")).toBe("ya29.pasted");
  });

  test("trades a service account key for a token at Google's endpoint, signed with its key", async () => {
    const calls: { url: string; form: URLSearchParams }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, form: new URLSearchParams(String(init.body)) });
      return Response.json({ access_token: "ya29.minted", expires_in: 3600 });
    }) as unknown as typeof fetch;
    let now = 1_000_000_000_000;
    const accessToken = createGoogleTokens(fetchFn, () => now);

    expect(await accessToken(credential)).toBe("ya29.minted");
    expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    expect(calls[0]!.form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [header, claims, signature] = calls[0]!.form.get("assertion")!.split(".") as [
      string,
      string,
      string,
    ];
    expect(decode(header)).toMatchObject({ alg: "RS256", kid: "abcdef123456" });
    expect(decode(claims)).toMatchObject({
      iss: "agent@my-project-123.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000_000_000,
      exp: 1_000_003_600,
    });
    const verify = createVerify("RSA-SHA256").update(`${header}.${claims}`);
    expect(verify.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);

    now += 50 * 60 * 1000;
    expect(await accessToken(credential)).toBe("ya29.minted");
    expect(calls).toHaveLength(1);
    now += 10 * 60 * 1000;
    await accessToken(credential);
    expect(calls).toHaveLength(2);
  });

  test("runs that start together share one exchange", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      await Bun.sleep(5);
      return Response.json({ access_token: "ya29.one", expires_in: 3600 });
    }) as unknown as typeof fetch;
    const accessToken = createGoogleTokens(fetchFn);
    const tokens = await Promise.all([accessToken(credential), accessToken(credential)]);
    expect(tokens).toEqual(["ya29.one", "ya29.one"]);
    expect(calls).toBe(1);
  });

  test("says why it failed, without the key, and tries again next time", async () => {
    let answer = () => new Response("nope", { status: 400 });
    const fetchFn = (async () => answer()) as unknown as typeof fetch;
    const accessToken = createGoogleTokens(fetchFn);
    const failure = async (attempt: Promise<string>) => {
      const error = await attempt.then(
        () => undefined,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(GoogleAuthError);
      const { message } = error as GoogleAuthError;
      expect(message).not.toContain("PRIVATE KEY");
      expect(message).not.toContain("not a key");
      expect(message).not.toContain("abcdef123456");
      return message;
    };

    expect(await failure(accessToken(credential))).toContain(
      "refused the service account key (400)",
    );
    answer = () => Response.json({ nothing: true });
    expect(await failure(accessToken(credential))).toContain("no access token");
    answer = () => Response.json({ access_token: "ya29.late" });
    expect(await accessToken(credential)).toBe("ya29.late");
    const broken = JSON.stringify({ ...JSON.parse(credential), private_key: "not a key" });
    expect(await failure(accessToken(broken))).toContain("private key could not be read");
  });
});
