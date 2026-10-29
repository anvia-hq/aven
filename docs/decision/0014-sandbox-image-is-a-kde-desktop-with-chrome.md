# The sandbox image is a KDE Plasma desktop with Chrome

Status: accepted. Supersedes the openbox and plank desktop of the image in 0009 and 0010; the tag, the daemon and everything that talks to it are unchanged.

## Context

The sandbox image (`aven-sandbox-desktop:dev`) had a hand-themed openbox and plank desktop with Chromium. A person taking over a thread's desktop sees it, so it should look like a real desktop, and the browser should be Google Chrome.

## Decision

- **The image is built on `lscr.io/linuxserver/webtop:debian-kde`** (pinned by digest) and adds Node, `@anvia/sandbox`, Xvnc, xdotool, ImageMagick, tmux and git. Its own s6 services are not used: `ENTRYPOINT` is reset and the daemon owns the display.
- **The daemon starts `openbox-session` as its window manager when it finds one.** The image ships a script of that name that starts Plasma (software rendering) and KWin. The daemon is unchanged.
- **The browser is Google Chrome on amd64 and Chromium on arm64**, because Google ships no Chrome for arm64 Linux. `anvia-chromium` picks whichever is installed and adds `--no-sandbox`; the stock launchers are pointed at it so the panel icon works. Real Chrome needs an amd64 image (`docker build --platform linux/amd64`) on an amd64 runner.
- **KWin is started by `openbox-session`, after `plasmashell` is up.** Plasma starts its window manager through systemd, which a container lacks, so without this windows have no title bar, buttons or way to be moved. `KWIN_COMPOSE` must not be set: forcing an OpenGL mode makes KWin exit, which leaves no window manager.
- The base image's `dockremap` user (uid 1000) is replaced by `node`, which owns `/workspace` as before.

## Consequences

- The image is about 7.3 GB, up from 3.2 GB, and a desktop with a browser open uses about 520 MB.
- Chrome 156 runs on the amd64 image under OrbStack's emulation on Apple Silicon: the daemon connects in about a second, and with a window open the container uses about 1.1 GiB of its 2 GiB. It is slower than native. The panel's browser icon works there: it starts Chrome through `anvia-chromium` at once, but under emulation the first window takes between 40 and 60 seconds to appear, so a screenshot taken sooner shows only the panel. Native amd64 was not measured.
- A runner starts containers for its own architecture unless `AVEN_SANDBOX_PLATFORM` is set. `AVEN_SANDBOX_PLATFORM=linux/amd64` with `AVEN_SANDBOX_IMAGE` pointing at an image built with `docker build --platform linux/amd64` runs Chrome on an arm64 host.
- A new webtop release is only picked up by changing the pinned digest.
