# The web image: the built platform behind Caddy, which also proxies /api to the control plane
# (decision 0073). Build from the repository root:
#   docker build -f apps/platform/Dockerfile -t aven-web .
FROM oven/bun:1.4.4 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY patches patches
COPY apps/cli/package.json apps/cli/
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/platform/package.json apps/platform/
COPY apps/runtime/package.json apps/runtime/
COPY packages/agents/package.json packages/agents/
COPY packages/db/package.json packages/db/
COPY packages/github/package.json packages/github/
COPY packages/protocol/package.json packages/protocol/
COPY packages/runtime-client/package.json packages/runtime-client/
COPY packages/server-kit/package.json packages/server-kit/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile --filter @aven/platform

COPY tsconfig.json ./
# The platform imports the source of the wire protocol and of the UI package.
COPY packages/protocol packages/protocol
COPY packages/ui packages/ui
COPY apps/platform apps/platform
WORKDIR /app/apps/platform
RUN bunx vite build

FROM caddy:2-alpine
LABEL org.opencontainers.image.source="https://github.com/anvia-hq/aven"
LABEL org.opencontainers.image.licenses="MIT"
COPY LICENSE /LICENSE
COPY apps/platform/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/platform/dist /srv
EXPOSE 80 443
