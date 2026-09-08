FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# better-sqlite3 需要編譯工具，裝完後在 runtime 層丟掉。
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# scripts 必須先進來：npm 的 postinstall 會執行 scripts/vendor-three.js
COPY scripts ./scripts
RUN npm ci --omit=dev

FROM base AS runtime
RUN useradd --system --uid 10001 --create-home app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/public/vendor ./public/vendor
COPY package.json server.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY docs ./docs

ENV PORT=3000 DB_PATH=/data/royale.db
VOLUME ["/data"]
RUN mkdir -p /data && chown -R app:app /data /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
