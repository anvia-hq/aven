#!/usr/bin/env bash
# Builds the aven binary for every platform a release supports and packs each as
# aven-<version>-<os>-<arch>.tar.gz (holding `aven` and the `LICENSE`), with a checksums.txt. The installer and
# `aven update` download these by that name (decision 0073).
#
#   apps/cli/scripts/build-release.sh 0.3.0 dist/release
set -euo pipefail

version="${1:?usage: build-release.sh <version> <output dir>}"
out="${2:?usage: build-release.sh <version> <output dir>}"
version="${version#v}"

cli="$(cd "$(dirname "$0")/.." && pwd)"
license="$cli/../../LICENSE"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# bun's target name, then the os and architecture names the installer uses.
for target in bun-darwin-arm64:darwin-arm64 bun-darwin-x64:darwin-amd64 bun-linux-x64:linux-amd64 bun-linux-arm64:linux-arm64; do
  bun_target="${target%%:*}"
  platform="${target##*:}"
  mkdir -p "$work/$platform"
  # @valibot/to-json-schema is imported lazily by Anvia and is not needed at run time.
  (cd "$cli" && bun build --compile --target="$bun_target" --external @valibot/to-json-schema \
    --define "AVEN_VERSION=\"$version\"" src/main.ts --outfile "$work/$platform/aven")
  cp "$license" "$work/$platform/LICENSE"
  tar -C "$work/$platform" -czf "$out/aven-$version-$platform.tar.gz" aven LICENSE
done

cd "$out"
if command -v sha256sum >/dev/null; then sha256sum aven-"$version"-*.tar.gz > checksums.txt
else shasum -a 256 aven-"$version"-*.tar.gz > checksums.txt; fi
echo "Built $version in $out"
