FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=3584
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* must be present at build time (inlined into the client bundle).
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ARG NEXT_PUBLIC_NEAR_NETWORK=mainnet
ARG NEXT_PUBLIC_NEAR_TREASURY=
ARG NEXT_PUBLIC_NEAR_LAUNCH_FEE=0.1
ARG NEXT_PUBLIC_NEAR_TOKEN_FACTORY=
ARG NEXT_PUBLIC_NEAR_REF_EXCHANGE=
ARG NEXT_PUBLIC_NEAR_WRAP=
ENV NEXT_PUBLIC_NEAR_NETWORK=$NEXT_PUBLIC_NEAR_NETWORK \
    NEXT_PUBLIC_NEAR_TREASURY=$NEXT_PUBLIC_NEAR_TREASURY \
    NEXT_PUBLIC_NEAR_LAUNCH_FEE=$NEXT_PUBLIC_NEAR_LAUNCH_FEE \
    NEXT_PUBLIC_NEAR_TOKEN_FACTORY=$NEXT_PUBLIC_NEAR_TOKEN_FACTORY \
    NEXT_PUBLIC_NEAR_REF_EXCHANGE=$NEXT_PUBLIC_NEAR_REF_EXCHANGE \
    NEXT_PUBLIC_NEAR_WRAP=$NEXT_PUBLIC_NEAR_WRAP
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
