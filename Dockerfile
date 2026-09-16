# syntax=docker/dockerfile:1.7

FROM node:22.23.2-bookworm AS web-build
WORKDIR /src
RUN corepack enable
COPY . .

# Disable install hooks so no backend/native or other application is built.
RUN yarn install --immutable
# Production sync rejects date-form canary client versions. Keep the source version.
RUN node -e "require('node:assert/strict').equal(require('./packages/frontend/apps/web/package.json').version, '0.27.5')"

# .git is excluded from the context; the HTML generator needs a revision.
ARG RAILWAY_GIT_COMMIT_SHA=638132866b774c6d2458c88273302873768d76eb
RUN GITHUB_SHA="$RAILWAY_GIT_COMMIT_SHA" BUILD_TYPE=canary PUBLIC_PATH=/ \
    yarn affine @affine/web build
RUN test -s packages/frontend/apps/web/dist/selfhost.html \
    && test -s packages/frontend/apps/web/dist/js/nbstore-0.27.5.worker.js

# Official 2026.9.13-canary.928, whose amd64 provenance identifies upstream
# 868acf8505eb349223e367ef75070d24eb04f7ad (the parent of our UI-only commit).
FROM ghcr.io/toeverything/affine:2026.9.13-canary.928@sha256:26255987854aa48c513175f0b96bfaa087c7c655c6c62969a5e692fd70a3e76d
WORKDIR /app
ENV DEPLOYMENT_TYPE=selfhosted \
    AFFINE_ENV=production

# Retain official assets outside the served tree, and preserve Admin unchanged.
# In production mode the backend uses Web HTML, not its canary mobile fallback.
RUN mv /app/static /app/official-static \
    && mkdir /app/static \
    && mv /app/official-static/admin /app/static/admin
COPY --from=web-build /src/packages/frontend/apps/web/dist/ /app/static/

# Run AFFiNE self-host predeploy/migrations before starting the server.
CMD ["sh", "-c", "node ./scripts/self-host-predeploy.js && exec node ./dist/main.js"]
