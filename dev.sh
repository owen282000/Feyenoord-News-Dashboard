#!/bin/bash

# Development startup script with hot reload

echo "Starting development environment with hot reload..."

# Stop and remove existing dev container
docker-compose -f docker-compose.dev.yml down

# Build and start with docker-compose
docker-compose -f docker-compose.dev.yml up --build

echo "Development server stopped."
