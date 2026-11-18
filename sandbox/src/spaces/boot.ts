import { UnavailableError } from "@aven/server-kit/errors";

export const SPACES_BOOT_PATH = "/home/user/.aven/runner-boot.env";

export const SPACES_BOOT_TIMEOUT_SECONDS = 600;

const SPACES_BOOT = `set -a
. /home/user/.aven/runner-boot.env
set +a
export DEBIAN_FRONTEND=noninteractive
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
  curl -fsSL "$releases/download/$tag/$file" -o "$tmp/$file" || return 1
  curl -fsSL "$releases/download/$tag/checksums.txt" -o "$tmp/checksums.txt" || return 1
  (cd "$tmp" && grep " $file$" checksums.txt | sha256sum -c -) || return 1
  tar -xzf "$tmp/$file" -C "$tmp" && as_root install -m 755 "$tmp/aven" /usr/local/bin/aven || return 1
  rm -rf "$tmp"
}
if ! command -v aven >/dev/null 2>&1; then
  { [ -n "$want" ] && fetch_aven "v$want"; } || fetch_aven latest || exit 1
elif [ -n "$want" ] && [ "$(aven version 2>/dev/null | head -n 1)" != "$want" ]; then
  fetch_aven "v$want" || echo "could not update aven to $want" >&2
fi
pidfile=/home/user/.aven/runner.pid
old=$(cat $pidfile 2>/dev/null)
if [ -n "$old" ] && [ "$(cat /proc/$old/comm 2>/dev/null)" = aven ]; then kill $old; sleep 1; fi
cd /home/user
setsid nohup aven runner run >> /home/user/.aven/runner.log 2>&1 < /dev/null &
echo $! > $pidfile
rm -f /home/user/.aven/runner-boot.env`;

export const SPACES_BOOT_COMMAND = `mkdir -p /home/user/.aven && chmod 600 ${SPACES_BOOT_PATH} && bash -lc '${SPACES_BOOT}'`;

const unusable = (value: string) => /\s/.test(value) || value.includes("\0");

const RELEASE = /^\d+\.\d+\.\d+$/;

export function spacesBootEnv(url: string, token: string, release?: string) {
  if (unusable(url) || unusable(token))
    throw new UnavailableError("The runner address or token is not usable");

  const wanted = release !== undefined && RELEASE.test(release) ? `AVEN_RELEASE=${release}\n` : "";

  return `AVEN_URL=${url}\nAVEN_RUNTIME_TOKEN=${token}\nAVEN_DIRS=/home/user\n${wanted}`;
}
