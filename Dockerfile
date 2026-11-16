# One image for DVote's services: the web app, the API (registrar and metadata service), the
# indexer and the relayer, each started with its own command. What the browser needs is fixed when
# the web app is built, so it comes in as build arguments; everything else is read at start-up.
#
#   docker build -t dvote --build-arg NEXT_PUBLIC_CHAIN_ID=11155111 \
#     --build-arg NEXT_PUBLIC_API_URL=https://example.org/api ... .
#
#   web      node apps/web/node_modules/next/dist/bin/next start apps/web
#   api      node apps/api/node_modules/tsx/dist/cli.mjs apps/api/src/server.ts
#   indexer  node apps/api/node_modules/tsx/dist/cli.mjs apps/api/src/indexer/main.ts
#   relayer  node apps/api/node_modules/tsx/dist/cli.mjs apps/api/src/relayer/main.ts
#   migrate  node apps/api/node_modules/prisma/build/index.js migrate deploy (from apps/api)
#
# The services run with a read-only root filesystem; the web app needs a writable
# apps/web/.next/cache and every service a writable /tmp.

FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
ENV CI=true PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@dvote/api..." --filter "@dvote/web..."

ARG NEXT_PUBLIC_CHAIN_ID
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_RELAYER_URL
ARG NEXT_PUBLIC_IPFS_GATEWAY
# The proving files the web app serves itself, checked against their pinned hashes: depth 16
# covers 65,536 voters. Deeper elections fall back to the published copies, checked the same way.
ARG ARTIFACT_DEPTH=16
RUN node packages/shared/scripts/semaphore-artifacts.mjs apps/web/public/semaphore "$ARTIFACT_DEPTH"
RUN pnpm --filter @dvote/web build

FROM node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
CMD ["node", "apps/api/node_modules/tsx/dist/cli.mjs", "apps/api/src/server.ts"]
