FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/platform/package.json apps/platform/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile --filter @aven/platform

COPY tsconfig.json ./
COPY apps/platform apps/platform
WORKDIR /app/apps/platform
RUN bunx vite build

FROM nginx:alpine
COPY apps/platform/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/platform/dist /usr/share/nginx/html
EXPOSE 80
