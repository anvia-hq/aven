FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
ARG BUN_VERSION=1.4.5-canary.20261120.1
ARG BUN_SHA512=WeORe6WhB0QEhPu739WCWKFswaplOIoP21RgEk3NmHC5gNOOKmHMiQZuy29bnEwtGqQ8LuBZ+SI57RHxbOhfZQ==
ARG PLAYWRIGHT_VERSION=1.64.1

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  openssl \
  postgresql \
  libasound2t64 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

ENV HOME=/root
ENV PATH="/root/.bun/bin:${PATH}"

RUN mkdir -p /root/.bun/bin \
  && curl -fsSL "https://registry.npmjs.org/@oven/bun-linux-x64/-/bun-linux-x64-${BUN_VERSION}.tgz" -o /tmp/bun.tgz \
  && test "$(openssl dgst -sha512 -binary /tmp/bun.tgz | base64 -w0)" = "${BUN_SHA512}" \
  && tar -xzf /tmp/bun.tgz -C /root/.bun/bin --strip-components=2 package/bin/bun \
  && rm -f /tmp/bun.tgz \
  && chmod +x /root/.bun/bin/bun \
  && ln -sf /root/.bun/bin/bun /root/.bun/bin/bunx \
  && touch "/root/.bun/bin/.version-${BUN_VERSION}" \
  && bun --revision

RUN bunx "playwright@${PLAYWRIGHT_VERSION}" install chromium-headless-shell \
  && rm -rf /root/.bun/install/cache
