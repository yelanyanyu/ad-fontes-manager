# Stage 1: Build Frontend
FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_ADMIN_TOKEN
ENV VITE_ADMIN_TOKEN=${VITE_ADMIN_TOKEN}

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm ci && cd client && npm ci

COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && \
    chown -R appuser:appgroup /app

COPY --chown=appuser:appgroup server.ts .
COPY --chown=appuser:appgroup db ./db
COPY --chown=appuser:appgroup routes ./routes
COPY --chown=appuser:appgroup controllers ./controllers
COPY --chown=appuser:appgroup services ./services
COPY --chown=appuser:appgroup utils ./utils
COPY --chown=appuser:appgroup middleware ./middleware
COPY --chown=appuser:appgroup schemas ./schemas
COPY --chown=appuser:appgroup --from=builder /app/dist ./dist

USER appuser

ENV NODE_ENV=production
ENV PORT=8080
ENV HEALTHCHECK_HOST=127.0.0.1
ENV HEALTHCHECK_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD sh -c "wget -q -O /dev/null http://${HEALTHCHECK_HOST}:${HEALTHCHECK_PORT}/api/health || exit 1"

CMD ["npm", "run", "start"]
