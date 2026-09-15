FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/mcp/package.json ./packages/mcp/package.json

RUN npm ci
RUN npx playwright install --with-deps chromium

COPY . .

RUN npm run build -w @siteapi/web

ENV NODE_ENV=production
ENV PORT=3000
ENV SITEAPI_URL=http://127.0.0.1:3000

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node scripts/healthcheck.mjs

CMD ["npm", "run", "start", "-w", "@siteapi/web"]
