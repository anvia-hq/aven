#!/usr/bin/env bash
# Installs Aven: the `aven` command, then a server and a runner on this machine (decision 0073).
#
#   curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash
#
# Only a runner, for a server somewhere else (Settings > Runtimes shows this with the token):
#
#   curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- \
#     --runner --url https://aven.example.com/api --token avrt_...
#
# Everything after `bash -s --` goes to `aven install` (see `aven help`). Run it again to update.
#
# Settings, as environment variables:
#   AVEN_INSTALL_VERSION  a release such as 0.3.0 (default: the latest)
#   AVEN_BIN_DIR          where to put `aven` (default: /usr/local/bin if writable, else ~/.local/bin)
#   AVEN_RELEASES_URL     where releases are (default: https://github.com/anvia-hq/aven/releases)
#   AVEN_YES=1            install git, and Docker for a server, without asking when they are missing
set -euo pipefail

RELEASES="${AVEN_RELEASES_URL:-https://github.com/anvia-hq/aven/releases}"
RELEASES="${RELEASES%/}"

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Whether there is a terminal to ask on. The script itself arrives on stdin when it is piped to bash.
have_tty() { (: </dev/tty) 2>/dev/null; }

# Asks a yes or no question; AVEN_YES=1 answers yes, no terminal answers no.
ask() {
  if [ "${AVEN_YES:-}" = 1 ]; then return 0; fi
  have_tty || return 1
  local reply
  printf '%s [y/N] ' "$1" >/dev/tty
  read -r reply </dev/tty || return 1
  case "$reply" in [yY]*) return 0 ;; *) return 1 ;; esac
}

as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif have sudo; then sudo "$@"
  else fail "This needs administrator rights and sudo is not installed."
  fi
}

detect_platform() {
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail "Aven installs on macOS and Linux. On Windows, use WSL2 with Ubuntu and run this there." ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=amd64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) fail "Unsupported CPU: $(uname -m)." ;;
  esac
}

need_tools() {
  local tool
  for tool in curl tar; do have "$tool" || fail "$tool is required."; done
  have sha256sum || have shasum || fail "sha256sum or shasum is required."
}

sha256_of() {
  if have sha256sum; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

install_git() {
  say "git is missing. A runner clones each project's repository with it."
  ask "Install git now?" || fail "Install git, then run this again."
  if [ "$os" = darwin ]; then
    if have brew; then brew install git
    else
      xcode-select --install || true
      fail "Finish the Command Line Tools installation that just opened, then run this again."
    fi
  elif have apt-get; then as_root apt-get update && as_root apt-get install -y git
  elif have dnf; then as_root dnf install -y git
  elif have yum; then as_root yum install -y git
  elif have pacman; then as_root pacman -S --noconfirm git
  elif have zypper; then as_root zypper install -y git
  elif have apk; then as_root apk add git
  else fail "Could not find a package manager. Install git, then run this again."
  fi
}

# Set when Docker was just installed on Linux: the user's new `docker` group applies to new logins
# only, so `aven install` runs inside it.
use_docker_group=0

wait_for_docker() {
  say "Waiting for Docker to start (the first start can take a minute)..."
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && return 0
    sleep 2
  done
  fail "Docker did not start. Open it once by hand, then run this again."
}

install_docker() {
  say "Docker is missing. Aven runs its server in containers."
  if [ "$os" = darwin ]; then
    have brew || fail "Install Docker Desktop (https://www.docker.com/products/docker-desktop) or OrbStack (https://orbstack.dev), start it, then run this again."
    ask "Install Docker Desktop with Homebrew now?" || fail "Install Docker, then run this again."
    brew install --cask docker
    open -a Docker
    wait_for_docker
  else
    ask "Install Docker Engine with Docker's own script (get.docker.com) now?" || fail "Install Docker (https://docs.docker.com/engine/install/), then run this again."
    curl -fsSL https://get.docker.com | as_root sh
    as_root systemctl enable --now docker || true
    as_root usermod -aG docker "$(id -un)"
    use_docker_group=1
  fi
}

ensure_docker_running() {
  if docker info >/dev/null 2>&1; then return 0; fi
  if [ "$os" = darwin ]; then
    say "Docker is installed but not running; starting it."
    open -a Docker 2>/dev/null || open -a OrbStack 2>/dev/null || fail "Start Docker, then run this again."
    wait_for_docker
  elif [ "$use_docker_group" = 0 ] && have sudo && sudo docker info >/dev/null 2>&1; then
    fail "Your user cannot use Docker. Run: sudo usermod -aG docker \$USER, log in again, then run this again."
  else
    fail "Docker is installed but not running. Start it (sudo systemctl start docker), then run this again."
  fi
}

ensure_dependencies() {
  if ! { have git && git --version >/dev/null 2>&1; }; then install_git; fi
  # A runner alone works on this machine itself (decision 0219): only the server needs Docker.
  local arg
  for arg in "$@"; do
    if [ "$arg" = "--runner" ]; then return 0; fi
  done
  have docker || install_docker
  if [ "$use_docker_group" = 0 ]; then ensure_docker_running; fi
}

resolve_version() {
  if [ -n "${AVEN_INSTALL_VERSION:-}" ]; then version="${AVEN_INSTALL_VERSION#v}"; return; fi
  # GitHub sends /releases/latest to the newest release's page: no API, no rate limit.
  local url
  url="$(curl -sSL -o /dev/null -w '%{url_effective}' "$RELEASES/latest")" || fail "Could not reach $RELEASES."
  case "$url" in
    */tag/*) version="${url##*/}"; version="${version#v}" ;;
    *) fail "Could not find the latest release at $RELEASES. Is there one yet?" ;;
  esac
}

pick_bin_dir() {
  if [ -n "${AVEN_BIN_DIR:-}" ]; then bin_dir="$AVEN_BIN_DIR"
  elif [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then bin_dir=/usr/local/bin
  else bin_dir="$HOME/.local/bin"
  fi
}

download_aven() {
  local file="aven-$version-$os-$arch.tar.gz" tmp expected actual
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  say "Downloading aven $version for $os-$arch..."
  curl -fsSL "$RELEASES/download/v$version/$file" -o "$tmp/$file" || fail "Could not download $file. Does release v$version exist?"
  curl -fsSL "$RELEASES/download/v$version/checksums.txt" -o "$tmp/checksums.txt" || fail "Could not download checksums.txt."
  expected="$(awk -v f="$file" '$2 == f || $2 == "*" f { print $1 }' "$tmp/checksums.txt")"
  [ -n "$expected" ] || fail "checksums.txt does not list $file."
  actual="$(sha256_of "$tmp/$file")"
  [ "$expected" = "$actual" ] || fail "$file does not match its checksum. Nothing was installed."
  tar -xzf "$tmp/$file" -C "$tmp"
  # A new file beside the old one, then one rename: an `aven` that is running is not disturbed.
  mkdir -p "$bin_dir"
  install -m 755 "$tmp/aven" "$bin_dir/.aven.new"
  mv -f "$bin_dir/.aven.new" "$bin_dir/aven"
  # Cleaned here, not by a trap: the script ends in `exec`, which would skip it.
  rm -rf "$tmp"
  trap - EXIT
}

# A bin directory that is not on the PATH gets added to the shell's startup file.
ensure_on_path() {
  case ":$PATH:" in *":$bin_dir:"*) return ;; esac
  local rc
  case "${SHELL:-}" in */zsh) rc="$HOME/.zshrc" ;; */bash) rc="$HOME/.bashrc" ;; *) rc="" ;; esac
  if [ -n "$rc" ]; then
    # Running the installer again must not add the line again.
    if ! grep -qsF "$bin_dir" "$rc"; then
      # The $PATH stays literal: the startup file expands it.
      # shellcheck disable=SC2016
      printf '\nexport PATH="%s:$PATH"\n' "$bin_dir" >>"$rc"
    fi
    say "$bin_dir is on your PATH in $rc. Open a new terminal to use \`aven\`."
  else
    say "Add $bin_dir to your PATH to use \`aven\`."
  fi
}

run_aven() {
  local cmd=("$bin_dir/aven" install "$@")
  # Piped to bash, stdin is the script: give `aven install` the terminal so it can ask.
  if [ ! -t 0 ] && have_tty; then exec "${cmd[@]}" </dev/tty; fi
  exec "${cmd[@]}"
}

usage() {
  cat <<'USAGE'
Installs Aven: the `aven` command, then a server and a runner on this machine.

  curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash

Only a runner, for a server somewhere else (Settings > Runtimes shows this with the token):

  curl -fsSL https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh | bash -s -- \
    --runner --url https://aven.example.com/api --token avrt_...

Everything after `bash -s --` goes to `aven install` (see `aven help`). Run it again to update.

Settings, as environment variables:
  AVEN_INSTALL_VERSION  a release such as 0.3.0 (default: the latest)
  AVEN_BIN_DIR          where to put `aven` (default: /usr/local/bin if writable, else ~/.local/bin)
  AVEN_RELEASES_URL     where releases are (default: https://github.com/anvia-hq/aven/releases)
  AVEN_YES=1            install git, and Docker for a server, without asking when they are missing
USAGE
}

main() {
  case "${1:-}" in
    -h | --help) usage; exit 0 ;;
  esac
  detect_platform
  need_tools
  ensure_dependencies "$@"
  resolve_version
  pick_bin_dir
  download_aven
  ensure_on_path
  if [ "$use_docker_group" = 1 ]; then
    # Docker was installed a moment ago: run inside its group so no new login is needed.
    local quoted
    quoted="$(printf '%q ' "$bin_dir/aven" install "$@")"
    exec sg docker -c "$quoted"
  fi
  run_aven "$@"
}

main "$@"
