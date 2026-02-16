#!/bin/bash
# Build and push Docker image to Docker Hub
# Usage: ./scripts/docker-build.sh [--push] [--version VERSION]

set -e

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Working directory has uncommitted changes."
    echo "Please commit your changes before building a Docker image."
    echo ""
    git status --short
    exit 1
fi

IMAGE_NAME="julianh2o/outreach"
PLATFORM="linux/amd64"

# Parse arguments
PUSH=false
VERSION=$(node -p "require('./package.json').version")

while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH=true
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--push] [--version VERSION]"
            exit 1
            ;;
    esac
done

BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Build the sync helper first (outputs to build/public/)
echo "Building sync helper..."
yarn build:sync-helper

echo "Building $IMAGE_NAME:$VERSION for $PLATFORM"
echo "  Build date: $BUILD_DATE"
echo "  VCS ref: $VCS_REF"

# Build the image
if [ "$PUSH" = true ]; then
    docker buildx build \
        --platform "$PLATFORM" \
        --build-arg VERSION="$VERSION" \
        --build-arg BUILD_DATE="$BUILD_DATE" \
        --build-arg VCS_REF="$VCS_REF" \
        -t "$IMAGE_NAME:$VERSION" \
        -t "$IMAGE_NAME:latest" \
        --push \
        .
else
    docker buildx build \
        --platform "$PLATFORM" \
        --build-arg VERSION="$VERSION" \
        --build-arg BUILD_DATE="$BUILD_DATE" \
        --build-arg VCS_REF="$VCS_REF" \
        -t "$IMAGE_NAME:$VERSION" \
        -t "$IMAGE_NAME:latest" \
        --load \
        .
fi

echo ""
echo "Build complete: $IMAGE_NAME:$VERSION"

if [ "$PUSH" = true ]; then
    echo "Image pushed to Docker Hub"
else
    echo "To push to Docker Hub, run: ./scripts/docker-build.sh --push"
fi
