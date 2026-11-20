import { UnavailableError } from "@aven/server-kit/errors";

import { isRelease } from "../spaces/boot";

export const LIZARD_BOOT_PATH = "/root/.aven/runner-boot.env";

export const LIZARD_BOOT_TIMEOUT_MS = 300_000;

export const LIZARD_FRESH_JOURNAL_COMMAND =
  'old=$(cat /root/.aven/runner.pid 2>/dev/null); if [ -n "$old" ] && [ "$(cat /proc/$old/comm 2>/dev/null)" = aven ]; then kill $old 2>/dev/null || true; sleep 1; fi; rm -rf /root/.aven/runtime/runs.db* /home/user/.aven/runtime/runs.db*';

const LIZARD_BOOT = `set -a
. /root/.aven/runner-boot.env
set +a
export DEBIAN_FRONTEND=noninteractive
mkdir -p /workspace /root/.aven
as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo -n "$@"; fi; }
need=""
for tool in curl git tar sha256sum; do
  command -v $tool >/dev/null 2>&1 || need=1
done
if [ -n "$need" ]; then
  as_root apt-get update -qq && as_root apt-get install -y -qq ca-certificates curl git tar coreutils || exit 1
fi
want=$AVEN_RELEASE
fetch_aven() {
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) echo "unsupported CPU" >&2; return 1 ;;
  esac
  releases=https://github.com/anvia-hq/aven/releases
  if [ "$1" = latest ]; then
    tag=$(basename "$(curl -fsSL -o /dev/null -w "%{url_effective}" $releases/latest)")
  else
    tag=$1
  fi
  file=aven-$(echo "$tag" | sed s/^v//)-linux-$arch.tar.gz
  tmp=$(mktemp -d)
  (
    curl -fsSL "$releases/download/$tag/$file" -o "$tmp/$file" &&
    curl -fsSL "$releases/download/$tag/checksums.txt" -o "$tmp/checksums.txt" &&
    (cd "$tmp" && grep " $file$" checksums.txt | sha256sum -c -) &&
    tar -xzf "$tmp/$file" -C "$tmp" &&
    as_root install -m 755 "$tmp/aven" /usr/local/bin/aven
  )
  status=$?
  rm -rf "$tmp"
  return $status
}
if ! command -v aven >/dev/null 2>&1; then
  { [ -n "$want" ] && fetch_aven "v$want"; } || fetch_aven latest || exit 1
elif [ -n "$want" ] && [ "$(aven version 2>/dev/null | head -n 1)" != "$want" ]; then
  fetch_aven "v$want" || echo "could not update aven to $want" >&2
fi
pidfile=/root/.aven/runner.pid
old=$(cat $pidfile 2>/dev/null)
if [ -n "$old" ] && [ "$(cat /proc/$old/comm 2>/dev/null)" = aven ]; then kill $old; sleep 1; fi
cd /workspace
setsid nohup aven runner run >> /root/.aven/runner.log 2>&1 < /dev/null &
echo $! > $pidfile
rm -f /root/.aven/runner-boot.env`;

export const LIZARD_BOOT_COMMAND = `mkdir -p /root/.aven /workspace && chmod 600 ${LIZARD_BOOT_PATH} && bash -lc '${LIZARD_BOOT}'`;

const unusable = (value: string) => /\s/.test(value) || value.includes("\0");

export function lizardBootEnv(url: string, token: string, release?: string) {
  if (unusable(url) || unusable(token))
    throw new UnavailableError("The runner address or token is not usable");

  const wanted = isRelease(release) ? `AVEN_RELEASE=${release}\n` : "";

  return `AVEN_URL=${url}\nAVEN_RUNTIME_TOKEN=${token}\nAVEN_DIRS=/workspace\n${wanted}`;
}
