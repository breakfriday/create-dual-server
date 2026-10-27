ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json bootstrap.js deployment.cjs ./
COPY src/ ./src/
COPY scripts/smoke-production.cjs ./scripts/smoke-production.cjs
RUN npm run build && npm prune --omit=dev --no-audit --no-fund
RUN node scripts/smoke-production.cjs . --check-only

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    SERVER_UPLOAD_DIR=/app/uploads \
    SERVER_LOG_DIR=/app/logs \
    SERVER_HTTP_PORT=__HTTP_PORT__
WORKDIR /app
COPY --from=build /build/package*.json ./
COPY --from=build /build/bootstrap.js /build/deployment.cjs ./
COPY --from=build /build/node_modules/ ./node_modules/
COPY --from=build /build/dist/ ./dist/
COPY --from=build /build/scripts/smoke-production.cjs ./scripts/smoke-production.cjs
RUN mkdir -p uploads logs && chown node:node uploads logs
USER node
EXPOSE __HTTP_PORT__
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.SERVER_HTTP_PORT+'/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "bootstrap.js"]
