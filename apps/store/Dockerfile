# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

# Prisma's native engine and outbound HTTPS clients require OpenSSL and a CA
# bundle at runtime. Keep them in the shared base so builder and runner use
# the same supported libraries.
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

# The repository explicitly requires npm 11. Pin it so local and EC2 builds
# resolve the lockfile with the same package-manager major and minor version.
RUN npm install --global npm@11.6.2

WORKDIR /workspace

# Copy dependency manifests first so application changes do not invalidate the
# expensive npm install layer.
COPY package.json package-lock.json ./
COPY apps/store/package.json apps/store/package.json
COPY apps/widget/package.json apps/widget/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

FROM dependencies AS builder
WORKDIR /workspace
COPY . .

# These values are deliberately limited to browser-safe build configuration.
# Server secrets are supplied only when the container starts.
ARG VITE_STORE_API_URL=http://localhost
ARG NEXT_PUBLIC_BASE_URL=http://localhost
ARG NEXT_PUBLIC_MANIKAN_WIDGET_KEY
ARG NEXT_PUBLIC_MANIKAN_RECOMMEND_KEY
ARG NEXT_PUBLIC_WIDGET_API_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

ENV VITE_STORE_API_URL=$VITE_STORE_API_URL \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_MANIKAN_WIDGET_KEY=$NEXT_PUBLIC_MANIKAN_WIDGET_KEY \
    NEXT_PUBLIC_MANIKAN_RECOMMEND_KEY=$NEXT_PUBLIC_MANIKAN_RECOMMEND_KEY \
    NEXT_PUBLIC_WIDGET_API_KEY=$NEXT_PUBLIC_WIDGET_API_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1

# Always build the embeddable Widget against the public Store URL, then place
# that immutable artifact where the Store serves it from the same origin.
RUN npm run build:lib --workspace=widget \
    && cp apps/widget/dist-lib/manikan-widget.js apps/store/public/manikan-widget.js

# Prisma needs a syntactically valid URL while generating its client, and a
# few Store modules construct SDK clients during Next's build analysis. These
# build-only placeholders contain no credentials and are replaced at runtime.
RUN cd apps/store \
    && DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build npx prisma generate
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build \
    SUPABASE_SERVICE_KEY=build_placeholder_not_a_real_key \
    STRIPE_SECRET_KEY=sk_test_build_placeholder \
    npm run build --workspace=store

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder --chown=node:node /workspace/apps/store/.next/standalone ./
COPY --from=builder --chown=node:node /workspace/apps/store/.next/static ./apps/store/.next/static
COPY --from=builder --chown=node:node /workspace/apps/store/public ./apps/store/public

USER node
EXPOSE 3000
CMD ["node", "apps/store/server.js"]
