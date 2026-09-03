FROM node:24-bookworm-slim AS dependencies
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:3001/v1
ARG API_INTERNAL_URL=http://api:3001/v1
ARG NEXT_PUBLIC_API_BASE_PATH=/api/backend
ARG NEXT_PUBLIC_SITE_URL=https://example.invalid
ENV NEXT_OUTPUT_ROOT=/app \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    API_INTERNAL_URL=${API_INTERNAL_URL} \
    NEXT_PUBLIC_API_BASE_PATH=${NEXT_PUBLIC_API_BASE_PATH} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
COPY apps/web/next.config.ts apps/web/next-env.d.ts apps/web/tsconfig.json apps/web/postcss.config.mjs ./
COPY apps/web/public ./public
COPY apps/web/src ./src
COPY packages/contracts /app/packages/contracts
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
RUN mkdir -p apps/web/.next/cache && chown -R node:node /app
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 3000}/`).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
