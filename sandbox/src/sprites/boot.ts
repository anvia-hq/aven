import { UnavailableError } from "@aven/server-kit/errors";

import { SPRITES_HOLD_NAME, SPRITES_HOME, SPRITES_WORKSPACE } from "./config";
import { isRelease } from "../spaces/boot";

export const SPRITES_BOOT_PATH = `${SPRITES_HOME}/.aven/runner-boot.env`;

export const SPRITES_PID_PATH = `${SPRITES_HOME}/.aven/runner.pid`;

export const SPRITES_BOOT_TIMEOUT_MS = 300_000;

const SOCKET = "/.sprite/api.sock";

const unusable = (value: string) => /\s/.test(value) || value.includes("\0");

export function spritesHoldCommand(seconds: number) {
  return `curl -s -o /dev/null --unix-socket ${SOCKET} -H 'Content-Type: application/json' -X PUT http://sprite/v1/tasks/${SPRITES_HOLD_NAME} -d '{"expire":${Math.floor(seconds)}}'`;
}

export const SPRITES_RELEASE_HOLD_COMMAND = `curl -s -o /dev/null --unix-socket ${SOCKET} -X DELETE http://sprite/v1/tasks/${SPRITES_HOLD_NAME}`;

const RUNNER_STOPPED = `old=$(cat ${SPRITES_PID_PATH} 2>/dev/null)
if [ -n "$old" ] && [ "$(cat /proc/$old/comm 2>/dev/null)" = aven ]; then kill $old; sleep 1; fi`;

export const SPRITES_STOP_COMMAND = `${RUNNER_STOPPED}
${SPRITES_RELEASE_HOLD_COMMAND}
rm -f ${SPRITES_PID_PATH}`;

const SPRITES_BOOT = `set -a
. ${SPRITES_BOOT_PATH}
set +a
export PATH=${SPRITES_HOME}/.local/bin:$PATH
export DEBIAN_FRONTEND=noninteractive
mkdir -p ${SPRITES_WORKSPACE} ${SPRITES_HOME}/.aven ${SPRITES_HOME}/.local/bin
as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo -n "$@"; fi; }
need=""
for tool in curl tar sha256sum; do
  command -v $tool >/dev/null 2>&1 || need=1
done
if [ -n "$need" ]; then
  as_root apt-get update -qq && as_root apt-get install -y -qq ca-certificates curl tar coreutils || exit 1
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
    install -m 755 "$tmp/aven" ${SPRITES_HOME}/.local/bin/aven
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
${RUNNER_STOPPED}
${spritesHoldCommand(3600)}
cd ${SPRITES_WORKSPACE}
setsid nohup aven runner run >> ${SPRITES_HOME}/.aven/runner.log 2>&1 < /dev/null &
echo $! > ${SPRITES_PID_PATH}
rm -f ${SPRITES_BOOT_PATH}`;

export const SPRITES_BOOT_COMMAND = SPRITES_BOOT;

export function spritesBootEnv(url: string, token: string, release?: string) {
  if (unusable(url) || unusable(token))
    throw new UnavailableError("The runner address or token is not usable");

  const wanted = isRelease(release) ? `AVEN_RELEASE=${release}\n` : "";

  return `AVEN_URL=${url}\nAVEN_RUNTIME_TOKEN=${token}\nAVEN_DIRS=${SPRITES_WORKSPACE}\n${wanted}`;
}
