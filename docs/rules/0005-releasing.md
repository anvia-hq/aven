# Releasing Aven

Status: accepted. Follows decision 0073 (install and update with a script).

How a release is made, what it contains, and what a change must keep true so that `aven update` keeps working for the people running Aven.

## Making a release

1. On `main`, with everything committed: `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun test apps packages` and `bun run test:e2e` pass.
2. Tag and push. The tag is the version; there is no version in any `package.json` to bump.

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. `.github/workflows/release.yml` runs on the tag (about as long as the sandbox image takes to build, which is the slow part) and produces:
   - `ghcr.io/anvia-hq/aven-server`, `aven-web` and `aven-sandbox`, each for amd64 and arm64, tagged `0.2.0` and `0.2`, and `latest` unless the tag is a prerelease;
   - `aven-0.2.0-<os>-<arch>.tar.gz` for darwin and linux on arm64 and amd64, with `checksums.txt` (built by `apps/cli/scripts/build-release.sh`, which sets the binary's version from the tag);
   - a GitHub Release with generated notes, with those files attached.
4. Check it before telling anyone: the Actions run is green, the release lists the four archives and `checksums.txt`, and on a machine (or a throwaway `HOME` and `AVEN_HOME`, see below) that has Aven from the previous release, `aven update` brings it to the new one and `aven doctor` is all `ok`. For a first install, `AVEN_INSTALL_VERSION=0.2.0 curl -fsSL .../install.sh | bash` on a clean machine.

**The first release of a repository** also needs a check that the three packages can be pulled by anyone, since GHCR may make a new package private. Ask for each without credentials; it answers 200 when public and 401 or 403 when not:

```sh
for p in aven-server aven-web aven-sandbox; do
  tok=$(curl -s "https://ghcr.io/token?service=ghcr.io&scope=repository:anvia-hq/$p:pull" | bun -e 'console.log((await Bun.stdin.json()).token ?? "")')
  curl -s -o /dev/null -w "$p %{http_code}\n" -H "authorization: Bearer $tok" \
    -H 'accept: application/vnd.oci.image.index.v1+json' "https://ghcr.io/v2/anvia-hq/$p/manifests/0.1.0"
done
```

If one is not public, set it to **public** in the package's settings on GitHub (Package settings > Danger zone); nobody can pull it until then. For `v0.1.0` all three were public from the first push, so nothing was needed. The `org.opencontainers.image.source` label in each Dockerfile links the packages to the repository.

## Versions

- A version is `X.Y.Z`. The tag is `vX.Y.Z`; everything else (image tags, the binary's `aven version`, the archive names) is that without the `v`.
- A tag with a dash, such as `v0.3.0-rc1`, is a **prerelease**: it gets a GitHub prerelease, its images carry the full version `0.3.0-rc1` and not `latest`, and `aven update` (which follows GitHub's `/releases/latest`) does not offer it. Test one with `aven update --release 0.3.0-rc1`.
- The server, the web app, the sandbox image and the `aven` binary of a release are one unit. A machine is updated as a whole (`aven update`), and a server's own `AVEN_VERSION` is what Settings > Runtimes compares each runner's release with.
- A runner and its control plane have to speak the same **runtime wire version** (`WIRE_VERSION` in `packages/protocol/src/runtime-wire.ts`). A release that changes it makes every older runner refuse to connect (`Unsupported runtime version`) until `aven update` has run on its machine. Say so in the release notes, add the version to `docs/products/0005-runtime-wire-versions.md`, and prefer an optional field that older runners can leave out (as `hello.build` was) when that is enough.

## Updating, and what that asks of a change

`aven update` replaces the binary, then the new binary rewrites the server's compose file, adds the settings the new `.env` template has and the file lacks (making a new secret when it is one the installer makes), sets `AVEN_VERSION`, pulls the images, starts the stack, and, for a runner, pulls the sandbox image and rewrites and restarts its service. So:

- **A new setting** goes in `deploy/env.example` with a safe default (the installer and `aven update` copy it). A new secret the installer should make goes in `newSecrets()` (`apps/cli/src/env-file.ts`).
- **A change to the compose file** is deployed by the binary of the same release, since the file is embedded in it. Do not rename the services (`postgres`, `server`, `web`) or the `postgres` volume: `aven` and people's backups refer to them.
- **A migration** (`bun run db:generate` in `packages/db`, committed, never edited by hand) runs when the server starts and only goes forward. Keep a release's migration compatible with the previous release's code when you can, because a person who pins the old release again runs old code on the new schema.
- **A change the runner needs** (a new sandbox tool, a new env var) is delivered by the sandbox image and the binary of the same release; a runner that has not updated keeps working on the old image until it does.

## Rolling back

`aven update --release 0.1.5` runs an older release's binary, compose file and images. It does **not** undo migrations. Before updating across a release that has a migration, take a backup (see the README); to go back for real, restore the backup and then pin the old release. There is no downgrade of the database.

## Testing the install and update paths

`install.sh`, `aven install`, `aven runner install` and `aven update` write outside the repository: shell startup files, a launchd agent or systemd unit, Docker containers and images. Test them with `HOME`, `AVEN_HOME` and `AVEN_BIN_DIR` pointing into a temporary directory, clean up afterwards (`aven uninstall --purge --yes`, `launchctl list | grep aven`, `docker ps -a`), and never against your own `~/.aven`. A local build can run against images tagged by hand and a fake releases server (`AVEN_RELEASES_URL`, `AVEN_SERVER_IMAGE`, `AVEN_WEB_IMAGE`): see `apps/cli/scripts/build-release.sh` and the CLI section of `AGENTS.md`.
