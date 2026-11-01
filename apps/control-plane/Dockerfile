# The control plane: the API, the runner hub and the migrations. Build from the repository root:
#   docker build -f apps/control-plane/Dockerfile -t aven-server .
# The built-in runner needs Docker on the host, so this image runs with AVEN_LOCAL_RUNNER=off and
# runners connect to it instead (decision 0073).
FROM oven/bun:1.4.4
WORKDIR /app

# Workspace manifests and patches first so the dependency layer is cached. Every workspace has to be
# here: a frozen lockfile does not install when one of its workspaces is missing.
COPY package.json bun.lock ./
COPY patches patches
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/platform/package.json apps/platform/
COPY apps/runtime/package.json apps/runtime/
COPY packages/agents/package.json packages/agents/
COPY packages/db/package.json packages/db/
COPY packages/protocol/package.json packages/protocol/
COPY packages/runtime-client/package.json packages/runtime-client/
RUN bun install --frozen-lockfile --production --filter @aven/control-plane

COPY tsconfig.json ./
COPY apps/control-plane apps/control-plane
COPY packages packages

ENV NODE_ENV=production PORT=8000 AVEN_LOCAL_RUNNER=off
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD bun -e "const r = await fetch('http://localhost:8000/health'); process.exit(r.ok ? 0 : 1)"
# Apply migrations, then start the server.
CMD ["sh", "-c", "bun packages/db/src/migrate.ts && bun apps/control-plane/src/index.ts"]
