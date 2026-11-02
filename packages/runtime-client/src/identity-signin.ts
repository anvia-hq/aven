import type { RunIdentityCredential } from "@aven/protocol/runtime-wire";

// What runs in the thread's container so `aven id-token` can mint OIDC tokens for the run (decision
// 0049), in the way `github-signin.ts` signs `gh` in: the credential comes in the environment, never
// in the script or an argument, the file is the container user's only, and each run replaces the last
// one's, so a run with no identity leaves nothing behind.
const SIGN_IN = `set -e
umask 077
mkdir -p "$HOME/.config/aven"
printf "AVEN_IDENTITY_URL='%s'\\nAVEN_IDENTITY_CREDENTIAL='%s'\\n" "$AVEN_IDENTITY_URL" "$AVEN_IDENTITY_CREDENTIAL" > "$HOME/.config/aven/identity"
`;

const SIGN_OUT = `rm -f "$HOME/.config/aven/identity"
`;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The control plane's address as the container sees it: a loopback host is the runner's own
 * machine, which the container reaches by `host`; any other address is the same from inside.
 */
export function reachableFromContainer(controlPlane: string, host: string) {
  const url = new URL(controlPlane);
  if (LOOPBACK.has(url.hostname)) url.hostname = host;
  // Any path prefix stays: behind the web entry the API is at `/api`.
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** The command that signs the container in to mint identity tokens with `identity`, or out when there is none. */
export function identitySignInCommand(
  identity: RunIdentityCredential | undefined,
  controlPlane: string,
  host: string,
) {
  if (!identity) return { script: SIGN_OUT, env: {} as Record<string, string> };
  return {
    script: SIGN_IN,
    env: {
      AVEN_IDENTITY_URL: reachableFromContainer(controlPlane, host),
      AVEN_IDENTITY_CREDENTIAL: identity.credential,
    },
  };
}
