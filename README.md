# Contact Directory

Personal contact management with iMessage integration. Track relationships, set contact frequencies, and sync message history.

## Features

- **Contact Management**: Store contacts with multiple channels (phone, email, address, social)
- **iMessage Sync**: Automatically sync message history from macOS Messages app
- **Contact Frequency**: Set outreach frequency per contact, track overdue contacts
- **Tags & Custom Fields**: Organize contacts with tags and extensible custom fields
- **REST API**: Full API access for external integrations

## Quick Start

```bash
# Install dependencies
yarn install

# Set up environment
cp .env.example .env

# Run development servers
yarn dev
```

Frontend: http://localhost:2998
Backend: http://localhost:2999

## Commands

```bash
yarn dev              # Run frontend + backend
yarn build            # Build frontend
yarn build:server     # Compile server TypeScript
yarn start            # Run production server
yarn test             # Run all tests
yarn lint             # Run ESLint
yarn typecheck        # TypeScript type checking
```

## iMessage Sync

Requires the `messages_sync_helper` macOS menu bar app. See [messages_sync_helper/README.md](messages_sync_helper/README.md).

The helper connects via WebSocket to sync new messages and can send messages via AppleScript.

## Environment Variables

```bash
PORT=2999                    # Server port (default: 2999)
DATABASE_URL="file:./data/db.db"  # SQLite database path
```

## API

See [API.md](API.md) for endpoint documentation.

## Docker

### Using Docker Compose (recommended)

```bash
docker compose up -d
```

### Manual Docker Commands

```bash
# Build locally
docker build -t outreach .

# Run container
docker run -p 2999:2999 -v ./data:/app/data outreach
```

### Build Scripts

```bash
yarn docker:build        # Build image locally
yarn docker:push         # Build and push to Docker Hub
```

The build script automatically tags with the git version and `latest`:

```bash
# Build with custom version
./scripts/docker-build.sh --version 1.0.0

# Build and push to registry
./scripts/docker-build.sh --push
```

### Pulling from Docker Hub

```bash
docker pull julianh2o/outreach:latest
docker run -p 2999:2999 -v ./data:/app/data julianh2o/outreach:latest
```
