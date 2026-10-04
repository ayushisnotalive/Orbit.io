# Stage 1: Build & Dependencies
FROM node:22-slim AS builder

WORKDIR /app

# OpenSSL required for Prisma engine binaries
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src/

RUN npx prisma generate
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root system user
RUN groupadd -r orbitping && useradd -r -g orbitping -d /app orbitping

COPY --chown=orbitping:orbitping package*.json ./
COPY --chown=orbitping:orbitping prisma ./prisma/

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=orbitping:orbitping --from=builder /app/dist ./dist
COPY --chown=orbitping:orbitping --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=orbitping:orbitping --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=orbitping:orbitping public ./public/
COPY --chown=orbitping:orbitping cli ./cli/

USER orbitping

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/healthz || exit 1

CMD ["node", "dist/index.js"]
