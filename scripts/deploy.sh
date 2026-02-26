#!/bin/bash

# OpenCode Cloud Deployment Script
# Usage: ./scripts/deploy.sh [railway|vercel|docker]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if .env file exists
check_env() {
    if [ ! -f ".env" ]; then
        log_error ".env file not found!"
        log_info "Creating .env from .env.example..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_warn "Please edit .env with your configuration"
            exit 1
        fi
    fi
    # Load environment variables
    export $(cat .env | grep -v '#' | xargs)
}

# Build the application
build() {
    log_info "Building application..."
    cd packages/opencode
    bun run build
    cd ../..
    log_info "Build complete!"
}

# Deploy to Railway
deploy_railway() {
    log_info "Deploying to Railway..."

    if ! command -v railway &> /dev/null; then
        log_error "Railway CLI not found. Install it: npm install -g @railway/cli"
        exit 1
    fi

    log_info "Linking to Railway project..."
    railway link

    log_info "Uploading code..."
    railway up

    log_info "Opening Railway dashboard..."
    railway open

    log_info "Deployment to Railway complete!"
}

# Deploy to Vercel (Frontend)
deploy_vercel() {
    log_info "Deploying frontend to Vercel..."

    if ! command -v vercel &> /dev/null; then
        log_error "Vercel CLI not found. Install it: npm install -g vercel"
        exit 1
    fi

    cd packages/app
    log_info "Building web app..."
    bun run build

    log_info "Deploying to Vercel..."
    vercel deploy --prod

    cd ../..
    log_info "Frontend deployment to Vercel complete!"
}

# Deploy via Docker
deploy_docker() {
    log_info "Building Docker image..."

    IMAGE_NAME="opencode:latest"

    docker build -f Dockerfile.prod -t $IMAGE_NAME .

    log_info "Docker image built: $IMAGE_NAME"
    log_info "To run locally: docker-compose up -d"
    log_info "To push to registry: docker tag $IMAGE_NAME your-registry/$IMAGE_NAME && docker push your-registry/$IMAGE_NAME"
}

# Deploy via docker-compose
deploy_compose() {
    log_info "Starting services with docker-compose..."

    check_env
    docker-compose up -d

    log_info "Waiting for services to be healthy..."
    sleep 10

    log_info "Services started!"
    log_info "Frontend: http://localhost:3001"
    log_info "API: http://localhost:3000"
    log_info "Database: localhost:5432"
}

# Display usage
usage() {
    cat << EOF
OpenCode Deployment Script

Usage: ./scripts/deploy.sh [command]

Commands:
  railway       Deploy backend to Railway
  vercel        Deploy frontend to Vercel
  docker        Build Docker image
  compose       Start services with docker-compose
  help          Show this help message

Environment Setup:
  1. Copy .env.example to .env
  2. Edit .env with your configuration
  3. Run deployment command

Examples:
  ./scripts/deploy.sh railway
  ./scripts/deploy.sh vercel
  ./scripts/deploy.sh compose
EOF
}

# Main
COMMAND=${1:-help}

case $COMMAND in
    railway)
        check_env
        build
        deploy_railway
        ;;
    vercel)
        check_env
        deploy_vercel
        ;;
    docker)
        build
        deploy_docker
        ;;
    compose)
        deploy_compose
        ;;
    help)
        usage
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        usage
        exit 1
        ;;
esac

log_info "Done!"
