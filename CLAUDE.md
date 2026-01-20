# CLAUDE.md

## Special instructions
IMPORTANT: Do not build or release unless specifically asked or granted permission.
IMPORTANT: When significant work is completed, perform a `yarn lint && yarn typecheck && yarn build` to verify the code quality.

## Project Overview

This is a minimal application template with a React/TypeScript frontend and Express backend. It provides a basic foundation for building web applications with authentication, routing, and database support.

## Commands

```bash
# Development
yarn dev                    # Run frontend + backend concurrently
yarn dev:client            # Frontend only (port 2998)
yarn dev:server            # Backend only (port 2999)

# Building
yarn build                 # Build frontend
yarn build:server          # Compile TypeScript server to JavaScript

# Production
yarn start                 # Run production server (YOU MUST build first)
yarn preview              # Build and run production server

# Testing
yarn test                 # Run all tests
yarn test:client          # Frontend tests only
yarn test:server          # Server tests only

# Code Quality
yarn lint                 # Run ESLint
yarn typecheck            # TypeScript type checking
yarn format               # Format with Prettier

# Database (Prisma)
yarn prisma:generate       # Generate Prisma client (auto-runs on postinstall)
yarn prisma:migrate        # Create and apply new migration
yarn prisma:migrate:deploy # Apply pending migrations (production)
yarn prisma:studio         # Open Prisma Studio GUI
```

## Architecture

For detailed information about the system architecture, directory structure, key patterns, API endpoints, and important files, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Database Management

**Prisma 7 Configuration**
- Database connection URL is configured in `prisma.config.ts` (not in schema.prisma)
- The Prisma client is automatically generated on `yarn install` (postinstall hook)
- When schema changes are made, `yarn dev:server` automatically runs migrations and regenerates the client
- Nodemon watches `prisma/schema.prisma` and restarts the server when it changes

**Important Notes**
- If you manually edit `prisma/schema.prisma`, the dev server will auto-restart
- After pulling schema changes from git, run `yarn install` or `yarn prisma:generate` to update the client
- The server MUST be restarted after Prisma client regeneration to avoid schema inconsistencies
- Database URL is set via `DATABASE_URL` environment variable in `.env`
