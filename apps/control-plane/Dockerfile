FROM oven/bun:1
WORKDIR /app

# Workspace manifests first so the dependency layer is cached.
COPY package.json bun.lock ./
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/platform/package.json apps/platform/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile --production --filter @aven/control-plane

COPY tsconfig.json ./
COPY apps/control-plane apps/control-plane
COPY packages/db packages/db

ENV NODE_ENV=production PORT=8000
EXPOSE 8000
# Apply migrations, then start the server.
CMD ["sh", "-c", "bun packages/db/src/migrate.ts && bun apps/control-plane/src/index.ts"]
