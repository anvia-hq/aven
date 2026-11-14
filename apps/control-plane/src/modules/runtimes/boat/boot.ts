import { UnavailableError } from "@aven/server-kit/errors";

export const BOAT_BOOT_PATH = "/home/user/.aven/boat-runner.env";

const BOOT = `set -a
. /home/user/.aven/boat-runner.env
set +a
if command -v aven >/dev/null 2>&1 && systemctl --user cat aven-runner >/dev/null 2>&1; then
  cp /home/user/.aven/boat-runner.env /home/user/.aven/runner.env
  chmod 600 /home/user/.aven/runner.env
  systemctl --user restart aven-runner
else
  curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- --runner --url "$AVEN_URL" --token "$AVEN_RUNTIME_TOKEN"
fi
rm -f /home/user/.aven/boat-runner.env`;

export const BOAT_BOOT_COMMAND = `mkdir -p /home/user/.aven && chmod 600 ${BOAT_BOOT_PATH} && bash -lc '${BOOT}'`;

const unusable = (value: string) => /\s/.test(value) || value.includes("\0");

export function runnerBootEnv(url: string, token: string) {
  if (unusable(url) || unusable(token))
    throw new UnavailableError("The runner address or token is not usable");

  return `AVEN_URL=${url}\nAVEN_RUNTIME_TOKEN=${token}\nAVEN_DIRS=/home/user\n`;
}
