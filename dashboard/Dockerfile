FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

FROM base AS build
# Next.js bakes rewrites in at build time, so the API address is a build arg.
ARG API_URL=http://api:8000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S -g 1001 jev && adduser -S -u 1001 -G jev jev
COPY --from=build --chown=jev:jev /app/.next/standalone ./
COPY --from=build --chown=jev:jev /app/.next/static ./.next/static
COPY --from=build --chown=jev:jev /app/public ./public
USER jev
EXPOSE 3000
CMD ["node", "server.js"]
