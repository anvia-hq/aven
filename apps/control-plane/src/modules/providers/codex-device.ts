import { UnprocessableError } from "@aven/server-kit/errors";

import type { CodexAuthFile } from "@aven/protocol/types";

const ISSUER = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

export type CodexDeviceCode = {
  deviceAuthId: string;
  userCode: string;
  verificationUrl: string;
  intervalSeconds: number;
  expiresAt: string | null;
};

export type CodexDevicePoll = { status: "pending" } | { status: "done"; auth: string };

type Fetch = typeof fetch;

class CodexDeviceError extends UnprocessableError {}

const json = { "Content-Type": "application/json" };

function accountIdOf(idToken: string) {
  const payload = idToken.split(".")[1];

  if (!payload) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const auth = claims["https://api.openai.com/auth"] as
      | { chatgpt_account_id?: unknown }
      | undefined;

    return typeof auth?.chatgpt_account_id === "string" ? auth.chatgpt_account_id : null;
  } catch {
    return null;
  }
}

export function createCodexDevice(fetchFn: Fetch = fetch, now: () => Date = () => new Date()) {
  return {
    async start(): Promise<CodexDeviceCode> {
      const response = await fetchFn(`${ISSUER}/api/accounts/deviceauth/usercode`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ client_id: CLIENT_ID }),
      });

      if (response.status === 404) {
        throw new CodexDeviceError("ChatGPT device sign-in is not available right now");
      }

      if (!response.ok) {
        throw new CodexDeviceError(`ChatGPT sign-in could not start (status ${response.status})`);
      }

      const body = (await response.json()) as {
        device_auth_id?: string;
        user_code?: string;
        usercode?: string;
        interval?: string | number;
        expires_at?: string;
      };
      const userCode = body.user_code ?? body.usercode;

      if (!body.device_auth_id || !userCode) {
        throw new CodexDeviceError("ChatGPT sign-in answered with something unexpected");
      }

      return {
        deviceAuthId: body.device_auth_id,
        userCode,
        verificationUrl: `${ISSUER}/codex/device`,
        intervalSeconds: Math.max(Number(body.interval) || 5, 1),
        expiresAt: body.expires_at ?? null,
      };
    },

    async poll(deviceAuthId: string, userCode: string): Promise<CodexDevicePoll> {
      const response = await fetchFn(`${ISSUER}/api/accounts/deviceauth/token`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
      });

      if (response.status === 403 || response.status === 404) return { status: "pending" };

      if (!response.ok) {
        throw new CodexDeviceError(`ChatGPT sign-in failed (status ${response.status})`);
      }

      const code = (await response.json()) as {
        authorization_code?: string;
        code_verifier?: string;
      };

      if (!code.authorization_code || !code.code_verifier) {
        throw new CodexDeviceError("ChatGPT sign-in answered with something unexpected");
      }

      const exchanged = await fetchFn(`${ISSUER}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code.authorization_code,
          redirect_uri: `${ISSUER}/deviceauth/callback`,
          client_id: CLIENT_ID,
          code_verifier: code.code_verifier,
        }),
      });

      if (!exchanged.ok) {
        throw new CodexDeviceError(`ChatGPT sign-in could not finish (status ${exchanged.status})`);
      }

      const tokens = (await exchanged.json()) as {
        id_token?: string;
        access_token?: string;
        refresh_token?: string;
      };

      if (!tokens.id_token || !tokens.access_token || !tokens.refresh_token) {
        throw new CodexDeviceError("ChatGPT sign-in answered with something unexpected");
      }

      const auth: CodexAuthFile & { OPENAI_API_KEY: null } = {
        auth_mode: "chatgpt",
        OPENAI_API_KEY: null,
        tokens: {
          id_token: tokens.id_token,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          account_id: accountIdOf(tokens.id_token),
        },
        last_refresh: now().toISOString(),
      };

      return { status: "done", auth: JSON.stringify(auth) };
    },
  };
}

export const codexDevice = createCodexDevice();
