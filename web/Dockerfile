# Stage 1: Build Frontend
FROM node:22-alpine AS builder
WORKDIR /app

# Copy root package.json and client package.json to leverage cache
COPY package*.json ./
COPY client/package*.json ./client/

# Install all dependencies
RUN npm ci
RUN cd client && npm ci

# Copy source code
COPY . .

# Build Vue frontend (outputs to /app/client/dist)
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Install only production dependencies for backend
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy backend source code
COPY server.js .
COPY localStore.js .
COPY db ./db
COPY routes ./routes
COPY controllers ./controllers
COPY services ./services
COPY utils ./utils
COPY middleware ./middleware

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Environment variables should be passed at runtime
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/core/health || exit 1

CMD ["node", "server.js"]
