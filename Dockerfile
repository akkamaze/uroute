FROM oven/bun:1.3.14 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/auth/package.json packages/auth/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN bun run test:api && bun run test:unit && bun run typecheck && bun run lint && bun run build

FROM oven/bun:1.3.14 AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/auth/package.json packages/auth/package.json
RUN bun install --frozen-lockfile --production
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/src apps/api/src
COPY --from=build /app/apps/api/migrations apps/api/migrations
USER bun
EXPOSE 3001
CMD ["bun", "apps/api/dist/index.js"]

FROM nginx:1.30.5-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/mobile/dist /usr/share/nginx/html
EXPOSE 80
