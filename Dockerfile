# Multi-stage build for optimized production image

# Stage 1: Build the application
FROM node:20-slim AS builder

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and Prisma schema (needed for postinstall hook)
COPY package.json yarn.lock .yarnrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Set DATABASE_URL for Prisma generate during postinstall
ENV DATABASE_URL="file:./data/db.db"

# Install dependencies (postinstall runs prisma generate)
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the server first (compile TypeScript to JavaScript -> build/)
RUN yarn build:server

# Build the frontend (outputs to build/public/)
RUN yarn build

# Copy config files to build directory
RUN cp -r src/config build/config

# Stage 2: Production image
FROM node:20-slim

# Build arguments for version and metadata
ARG VERSION=unknown
ARG BUILD_DATE
ARG VCS_REF

# OCI standard labels
LABEL org.opencontainers.image.title="Outreach"
LABEL org.opencontainers.image.description="Contact management and messaging platform"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${VCS_REF}"
LABEL org.opencontainers.image.authors="Julian Hartline <https://www.julianhartline.com>"

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json yarn.lock .yarnrc ./

# Install production dependencies only
# Use --ignore-scripts to skip postinstall (prisma generate) since we copy the
# generated Prisma client from the builder stage
RUN yarn install --frozen-lockfile --production --ignore-scripts && \
    yarn cache clean

# Copy Prisma schema, config, and migrations
COPY prisma ./prisma
COPY prisma.config.ts ./

# Copy generated Prisma Client from builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Set dummy DATABASE_URL for runtime
ENV DATABASE_URL="file:./data/db.db"

# Copy entire build directory from builder stage
# This contains: compiled server code, frontend (in public/), and config files
COPY --from=builder /app/build ./build

# Create data directory for database
RUN mkdir -p data

# Expose the port (defaults to 2999 but can be overridden with PORT env var)
EXPOSE 2999

# Set NODE_ENV to production
ENV NODE_ENV=production

# Store version info
ENV APP_VERSION="${VERSION}"

# Start the server (run migrations first)
CMD ["sh", "-c", "npx prisma migrate deploy && NODE_ENV=production node build/index.js"]
