# The sandbox desktop is Xfce

Status: accepted. Supersedes the KDE Plasma desktop of 0014; the browser choice (Chrome on amd64, Chromium on arm64, started through `anvia-chromium`), the daemon, the tag `aven-sandbox-desktop:dev` and everything that talks to it are unchanged.

## Context

Plasma needed workarounds in a container: `openbox-session` had to start KWin by hand after `plasmashell`, because Plasma starts its window manager through systemd, and `KWIN_COMPOSE` could not be set. A fresh desktop used about 520 MB idle. In use, the wallpaper drew as a small tile in the corner of a black screen. A desktop a person takes over should look finished and cost little, since every thread has one and a runner hosts several.

## Decision

- **The image is built on `lscr.io/linuxserver/webtop:debian-xfce`** (Debian 13, pinned by digest), replacing the `debian-kde` base. Everything added in 0014 and 0037 stays.
- **`openbox-session` starts `xfce4-session`** under `dbus-run-session`, with software rendering. Xfce's window manager, panel and desktop start without systemd, so nothing is started by hand.
- **On first start it seeds the settings** from the base image's `/defaults/xfce` (the base's own start script is not used), then makes the desktop clean: the panel goes at the bottom without the workspace switcher, there is one workspace instead of the base's four, no icons on the desktop, and a wallpaper. The base ships no wallpaper (the screen is black) and its own is an SVG nothing in the image can draw, so the image carries `wallpaper.jpg`, a soft white wave image (1200x672, taken from Pinterest, so its licence is not known), as `/usr/share/backgrounds/aven.jpg`. It is committed beside the Dockerfile so a build does not depend on a remote host.
- **The panel's browser button is `anvia-chromium`**, registered as an Xfce helper and made the default in `/etc/xdg/xfce4/helpers.rc`, so it starts with `--no-sandbox` like the other launchers.
- The container test for the window manager checks for `xfwm4` instead of `kwin_x11`.

## Consequences

- Chromium and a terminal open on it use about 330 MB in all (measured on arm64, not amd64 or under emulation).
- The desktop is light: the Greybird-bright theme (window borders from Greybird), with the panel at the bottom. The base sets the dark theme, so the first-start seeding switches it. The "Choose Preferred Application" dialog came from `helpers.rc` naming only a browser; it now also names Thunar and Xfce Terminal.
- Decisions 0015 and 0016 still say Plasma; they describe what was true then. Whether Xfce runs under gVisor (0016) has not been tried.
- Runners must rebuild the image.
