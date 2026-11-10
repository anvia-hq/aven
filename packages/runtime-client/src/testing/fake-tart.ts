import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SCRIPT = `#!/bin/bash
state="$FAKE_TART_STATE"
cmd="$1"; shift
echo "$cmd $*" >> "$state/calls.log"
case "$cmd" in
  --version) echo "fake-tart 1.0" ;;
  list) ls "$state/vms" ;;
  get) [ -d "$state/vms/$1" ] || { echo "the VM $1 does not exist" >&2; exit 1; } ;;
  clone)
    [ -d "$state/vms/$1" ] || { echo "the VM $1 does not exist" >&2; exit 1; }
    cp -R "$state/vms/$1" "$state/vms/$2" ;;
  set) ;;
  delete) rm -rf "$state/vms/$1" ;;
  run)
    name=""; : > /dev/null
    for arg in "$@"; do
      case "$arg" in
        --dir=*) pair="\${arg#--dir=}"; echo "\${pair%%:*} \${pair#*:}" | sed 's/:ro$//' >> "$state/dirs.$$" ;;
        --*) ;;
        *) name="$arg" ;;
      esac
    done
    [ -d "$state/vms/$name" ] || { echo "the VM $name does not exist" >&2; exit 1; }
    [ -f "$state/fail-run" ] && { echo "Virtualization failed" >&2; exit 1; }
    [ -f "$state/dirs.$$" ] && mv "$state/dirs.$$" "$state/vms/$name/dirs"
    sleep "\${FAKE_TART_BOOT_SECONDS:-0}"
    echo "VNC server is running at vnc://:fake-pass@127.0.0.1:\${FAKE_TART_VNC_PORT:-1}"
    touch "$state/vms/$name/up"
    while [ ! -f "$state/vms/$name/stop" ]; do sleep 0.05; done
    rm -f "$state/vms/$name/up" "$state/vms/$name/stop" ;;
  stop)
    name="$1"
    touch "$state/vms/$name/stop"
    for i in $(seq 1 100); do [ -f "$state/vms/$name/up" ] || break; sleep 0.05; done ;;
  exec)
    stdin=0
    [ "$1" = "-i" ] && { stdin=1; shift; }
    name="$1"; shift
    [ -f "$state/vms/$name/up" ] || { echo "the VM $name is not running" >&2; exit 1; }
    mapping() { awk -v t="$1" '$1 == t { print substr($0, length(t) + 2) }' "$state/vms/$name/dirs"; }
    if [ "$stdin" = 1 ]; then
      script="$(cat)"
      workspace="$(mapping workspace)"
      script="$(printf '%s' "$script" | sed -e "s#'/workspace#'$workspace#g" -e 's#/usr/bin/sudo -n ##' -e "s#/etc/synthetic.conf#$state/synthetic.conf#")"
      exec /bin/bash -c "$script"
    fi
    case "$1" in */hidutil) echo "hidutil $*" >> "$state/calls.log"; exit 0 ;; esac
    exec "$@" ;;
  *) echo "unknown command $cmd" >&2; exit 2 ;;
esac
`;

export async function fakeTart(root: string, images: readonly string[] = ["base"]) {
  const state = join(root, "tart-state");
  await mkdir(join(state, "vms"), { recursive: true });
  for (const image of images) await mkdir(join(state, "vms", image), { recursive: true });
  const bin = join(root, "tart");
  await writeFile(bin, SCRIPT);
  await chmod(bin, 0o755);
  return { bin, state, env: { FAKE_TART_STATE: state } };
}
