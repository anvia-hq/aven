# The sandbox image: a KDE Plasma desktop an agent can see and drive and a person can take over,
# with Google Chrome (amd64; Google ships none for arm64, which gets Chromium), tmux, git, Node and
# the Anvia daemon. Decision 0014.
#
#   docker build -t aven-sandbox-desktop:dev apps/runtime/sandbox-image
#   Chrome needs an amd64 image: build with --platform linux/amd64 and run it on an amd64 runner.
#
# The daemon dials out to the runner's hub, so nothing needs to be published. It starts Xvnc, and
# then `openbox-session` as the window manager when it finds one on the PATH: here that name is a
# small script that starts Plasma. Nothing graphical runs until the desktop is first used.
FROM lscr.io/linuxserver/webtop:debian-kde@sha256:84c10818d066c2bf2ad690312135669ca1f798421c0a1608bf205e07b49887fb

USER root
ARG TARGETARCH
ARG ANVIA_SANDBOX_PACKAGE=@anvia/sandbox@1.3.2
ARG NODE_PTY_VERSION=^1.1.0

# Xvnc (tigervnc-standalone-server): the display and its VNC server in one process. xdotool and
# ImageMagick: the agent's input and screenshots. xrandr: resizing. tmux and node-pty (below):
# terminals that survive reconnects, which need the compilers build-essential brings.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg git tmux procps dbus-x11 build-essential python3 \
    tigervnc-standalone-server xdotool imagemagick x11-utils x11-xserver-utils \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && if [ "$TARGETARCH" = "amd64" ]; then \
       curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google.gpg \
       && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
       && apt-get update && apt-get install -y google-chrome-stable; \
     else apt-get install -y chromium; fi \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g "${ANVIA_SANDBOX_PACKAGE}" "node-pty@${NODE_PTY_VERSION}" && npm cache clean --force
ENV NODE_PATH=/usr/lib/node_modules

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
  install -d -o node -g users /workspace /home/node/.anvia-sandbox

# The base starts its own services through s6; the daemon owns the display here.
ENTRYPOINT []
USER node
WORKDIR /workspace
ENV HOME=/home/node \
    ANVIA_SANDBOX_WORKDIR=/workspace \
    ANVIA_SANDBOX_STATE_DIR=/home/node/.anvia-sandbox

# Required at run time: ANVIA_CONTROL_URL and ANVIA_SANDBOX_TOKEN.
CMD ["anvia-sandbox-daemon"]
