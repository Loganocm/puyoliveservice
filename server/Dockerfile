# Game server image.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT, not server/. The server depends on
# packages/engine, and a context rooted at server/ cannot see a sibling
# directory, so the context moved outward when the engine was extracted.
# docker-compose.yml and .github/workflows/deploy.yml both pass
# `context: .` with `dockerfile: server/Dockerfile`; see the root
# .dockerignore for what that context excludes.
#
# npm workspaces means one lockfile at the root, so `npm ci` runs there and is
# filtered to just the two workspaces this image needs -- the root's own
# dependencies are the browser client's (pixi, react, vite) and have no place
# in a server image.

# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so the dependency layer is cached until they change.
COPY package.json package-lock.json ./
COPY packages/engine/package.json ./packages/engine/
COPY server/package.json ./server/
RUN npm ci --workspace @puyolive/engine \
           --workspace puyolive-socket-server \
           --include-workspace-root=false

COPY packages/engine ./packages/engine
COPY server ./server

# The engine must be built first: the server resolves it through node_modules
# to its compiled output, not to its TypeScript source. (The browser client
# does the opposite and aliases straight to src/ -- see vite.config.ts.)
RUN npm run build --workspace @puyolive/engine
RUN npm run build --workspace puyolive-socket-server

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/engine/package.json ./packages/engine/
COPY server/package.json ./server/
RUN npm ci --omit=dev \
           --workspace @puyolive/engine \
           --workspace puyolive-socket-server \
           --include-workspace-root=false

# Both dist trees, because node resolves @puyolive/engine through the workspace
# symlink npm just created in /app/node_modules.
COPY --from=build /app/packages/engine/dist ./packages/engine/dist
COPY --from=build /app/server/dist ./server/dist

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

EXPOSE 3000
ENV PORT=3000
WORKDIR /app/server
CMD ["node", "dist/index.js"]
