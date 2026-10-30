# The sandbox image: an Xfce desktop an agent can see and drive and a person can take over,
# with Google Chrome (amd64; Google ships none for arm64, which gets Chromium), tmux, git, the
# toolchains an agent reaches for (Node, Bun, Python, Go, Rust) and the Anvia daemon. Decisions 0014
# 0037 and 0038.
#
#   docker build -t aven-sandbox-desktop:dev apps/runtime/sandbox-image
#   Chrome needs an amd64 image: build with --platform linux/amd64 and run it on an amd64 runner.
#
# The daemon dials out to the runner's hub, so nothing needs to be published. It starts Xvnc, and
# then `openbox-session` as the window manager when it finds one on the PATH: here that name is a
# small script that starts Xfce. Nothing graphical runs until the desktop is first used.
FROM lscr.io/linuxserver/webtop:debian-xfce@sha256:2de7b2cb2f9e55fde54e07a83ffeb4f09cac846f1219896dd3d44de7d0aa9731

USER root
ARG TARGETARCH
ARG ANVIA_SANDBOX_PACKAGE=@anvia/sandbox@1.3.2
ARG NODE_PTY_VERSION=^1.1.0
ARG GO_VERSION=1.25.3
ARG BUN_VERSION=1.4.4
ARG RUST_VERSION=1.99.1
ARG PNPM_VERSION=12.16.1

# Xvnc (tigervnc-standalone-server): the display and its VNC server in one process. xdotool and
# ImageMagick: the agent's input and screenshots. xrandr: resizing. tmux and node-pty (below):
# terminals that survive reconnects, which need the compilers build-essential brings.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg git tmux procps dbus-x11 build-essential python3 python3-venv \
    wget jq ripgrep ffmpeg poppler-utils postgresql-client gh unzip \
    tigervnc-standalone-server xdotool imagemagick x11-utils x11-xserver-utils \
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y nodejs \
  && if [ "$TARGETARCH" = "amd64" ]; then \
       curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google.gpg \
       && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
       && apt-get update && apt-get install -y google-chrome-stable; \
     else apt-get install -y chromium; fi \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g "${ANVIA_SANDBOX_PACKAGE}" "node-pty@${NODE_PTY_VERSION}" "pnpm@${PNPM_VERSION}" && npm cache clean --force
ENV NODE_PATH=/usr/lib/node_modules

# Bun, Go and Rust live under /usr/local, readable by everyone; Rust's home is handed to `node` below
# so `cargo install` and `rustup` work for the agent.
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo \
    PATH=/opt/venv/bin:/usr/local/go/bin:/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v${BUN_VERSION}" \
  && curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${TARGETARCH}.tar.gz" | tar -C /usr/local -xz \
  && curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain "${RUST_VERSION}" --no-modify-path

# Python libraries for documents, spreadsheets and data live in one virtualenv at the front of PATH
# (Debian 13 refuses system-wide pip installs, PEP 668); the agent opens and writes office files
# with them, there is no LibreOffice (decision 0037).
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir uv==0.13.6 pandas==3.1.0 numpy==2.5.4 openpyxl==3.1.5 \
    xlsxwriter==3.3.1 python-docx==1.2.0 python-pptx==1.0.2 markitdown==0.1.9 mammoth==1.13.0 \
    beautifulsoup4==4.15.0 lxml==6.1.3 requests==2.34.2 pillow==13.0.0 onnxruntime==1.31.1 redis==8.1.0

# Debian's /etc/profile resets PATH for login shells (tmux terminals, `bash -l`), which would lose the
# toolchains above, so put them back there too.
RUN printf '%s\n' 'export RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo' \
    'export PATH=/opt/venv/bin:/usr/local/go/bin:/usr/local/cargo/bin:$PATH' > /etc/profile.d/aven-toolchains.sh

COPY anvia-chromium /usr/local/bin/anvia-chromium
COPY openbox-session /usr/local/bin/openbox-session
# The panel and links open the browser through its stock launcher, which would start it without
# --no-sandbox and fail inside Docker's default seccomp profile, so point them at the wrapper. The
# base image has a user on uid 1000 we do not want, so `node` takes its place (it owns /workspace).
RUN chmod 0555 /usr/local/bin/anvia-chromium /usr/local/bin/openbox-session \
  && for entry in chromium google-chrome; do \
       f=/usr/share/applications/$entry.desktop; \
       [ -f "$f" ] && sed -i -E 's|^Exec=[^ ]*(chromium\|google-chrome-stable)|Exec=/usr/local/bin/anvia-chromium|' "$f"; \
     done; \
  userdel dockremap 2>/dev/null; \
  id -u node >/dev/null 2>&1 || useradd -m -u 1000 -N -g users -s /bin/bash node; \
  install -d -o node -g users /workspace /home/node/.anvia-sandbox; \
  chown -R node:users /opt/venv /usr/local/rustup /usr/local/cargo

# The base sets no wallpaper (the screen is black) and its own is an SVG nothing here can draw;
# `openbox-session` points the desktop at this one (a soft white wave image from Pinterest;
# licence: unknown, to be replaced).
COPY wallpaper.jpg /usr/share/backgrounds/aven.jpg

# Xfce opens the browser, the file manager and the terminal through its helper settings, not a
# .desktop file we can edit above, so register the wrapper as a helper and set all three defaults
# (without them Xfce asks "Choose Preferred Application" the first time a folder is opened).
RUN printf '%s\n' '[Desktop Entry]' 'Version=1.0' 'Type=X-XFCE-Helper' 'X-XFCE-Category=WebBrowser' \
    'X-XFCE-Commands=/usr/local/bin/anvia-chromium' 'X-XFCE-CommandsWithParameter=/usr/local/bin/anvia-chromium "%s"' \
    'Icon=web-browser' 'Name=Browser' > /usr/share/xfce4/helpers/anvia-browser.desktop \
  && printf '%s\n' 'WebBrowser=anvia-browser' 'FileManager=thunar' 'TerminalEmulator=xfce4-terminal' > /etc/xdg/xfce4/helpers.rc

# The base starts its own services through s6; the daemon owns the display here.
ENTRYPOINT []
USER node
WORKDIR /workspace
ENV HOME=/home/node \
    ANVIA_SANDBOX_WORKDIR=/workspace \
    ANVIA_SANDBOX_STATE_DIR=/home/node/.anvia-sandbox

# Required at run time: ANVIA_CONTROL_URL and ANVIA_SANDBOX_TOKEN.
CMD ["anvia-sandbox-daemon"]
