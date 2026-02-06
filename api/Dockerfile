# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app

# Copy package files and prisma schema (needed for prisma generate in postinstall)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# Copy built application
COPY --from=build /app/dist ./dist

# Copy entrypoint script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Health check (uses PORT env var, default 8080 in production)
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT:-8080}/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]

EXPOSE 8080
