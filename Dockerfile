# Build stage
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# Production stage
FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production

WORKDIR /app

RUN corepack enable

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
