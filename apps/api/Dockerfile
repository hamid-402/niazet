FROM node:24-bookworm-slim AS base
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public \
    node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production \
    APP_PORT=3001
WORKDIR /app
RUN mkdir -p storage/uploads storage/quarantine \
    && chown -R node:node /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node scripts/production-start.mjs ./scripts/production-start.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.APP_PORT || 3001}/health`).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]
CMD ["node", "scripts/production-start.mjs"]
