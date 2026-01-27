# Stage 1: Build Frontend
FROM node:18-alpine AS builder
WORKDIR /app

# Copy root package.json and client package.json to leverage cache
COPY package*.json ./
COPY client/package*.json ./client/

# Install all dependencies
RUN npm install
RUN cd client && npm install

# Copy source code
COPY . .

# Build Vue frontend (outputs to /app/dist)
RUN npm run build

# Stage 2: Production Runtime
FROM node:18-alpine
WORKDIR /app

# Install only production dependencies for backend
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend source code
COPY server.js .
COPY localStore.js .
COPY db ./db
COPY routes ./routes
COPY controllers ./controllers
COPY services ./services

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Environment variables should be passed at runtime
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["npm", "start"]
