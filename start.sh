#!/usr/bin/env bash
set -e

# Change to script directory
cd "$(dirname "$0")"

echo "======================================================="
echo "         Land Parcel Management System (LPMS)"
echo "               Starting Local Server..."
echo "======================================================="
echo ""

# 1. Check if Docker is installed and running
if ! command -v docker >/dev/null 2>&1; then
    echo "[ERROR] Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker service is not running or current user lacks docker permissions."
    echo "Tip: Try 'sudo systemctl start docker' or run script with sudo."
    exit 1
fi

# Detect docker compose plugin vs standalone docker-compose
COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE="docker-compose"
    else
        echo "[ERROR] Neither 'docker compose' nor 'docker-compose' was found."
        exit 1
    fi
fi

# 2. Check if .env exists, copy from template if not
if [ ! -f ".env" ]; then
    echo "[*] .env not found. Creating default configuration from .env.local.example..."
    cp .env.local.example .env
    echo "[*] .env created successfully."
fi

# 3. Read APP_PORT from .env (defaults to 8080)
APP_PORT=$(grep -E "^APP_PORT=" .env | cut -d '=' -f2 | tr -d '\r' || echo "8080")
if [ -z "$APP_PORT" ]; then
    APP_PORT="8080"
fi

# 4. Start Docker containers
echo "[*] Starting containers with $COMPOSE..."
$COMPOSE up -d

# Try to find local LAN IP
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$HOST_IP" ]; then
    HOST_IP="<this-server-ip>"
fi

echo ""
echo "======================================================="
echo "  LPMS is running!"
echo ""
echo "  Access the app in your browser:"
echo "    - On this machine:    http://localhost:$APP_PORT"
echo "    - Across office LAN:  http://$HOST_IP:$APP_PORT"
echo ""
echo "  Default Admin Login:    admin@lms.com"
echo "  Default Admin Password: Admin@1234"
echo "======================================================="
echo ""
