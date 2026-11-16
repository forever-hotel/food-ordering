# Multi-stage Dockerfile for Forever Hotel FOSS Backend (NestJS)
# Stage 1: Build stage
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-fund

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ ./src/

RUN npm run build

# Stage 2: Production runtime stage
FROM node:24-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=4300

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-fund && npm cache clean --force

COPY --from=builder /usr/src/app/dist ./dist

# Run as non-root user
USER node

EXPOSE 4300

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4300/health/live || exit 1

CMD ["node", "dist/main.js"]
