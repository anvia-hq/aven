import type { RunIdentityCredential } from "@aven/protocol/types";

const SIGN_IN = `set -e
umask 077
mkdir -p "$HOME/.config/aven"
printf "AVEN_IDENTITY_URL='%s'\\nAVEN_IDENTITY_CREDENTIAL='%s'\\n" "$AVEN_IDENTITY_URL" "$AVEN_IDENTITY_CREDENTIAL" > "$HOME/.config/aven/identity"
`;

const SIGN_OUT = `rm -f "$HOME/.config/aven/identity"
`;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const isLoopback = (controlPlane: string) => LOOPBACK.has(new URL(controlPlane).hostname);

export function originOf(controlPlane: string) {
  const url = new URL(controlPlane);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function identitySignInCommand(identity: RunIdentityCredential | undefined, origin: string) {
  if (!identity) return { script: SIGN_OUT, env: {} as Record<string, string> };
  return {
    script: SIGN_IN,
    env: {
      AVEN_IDENTITY_URL: origin,
      AVEN_IDENTITY_CREDENTIAL: identity.credential,
    },
  };
}
