#!/usr/bin/env bash
set -e

# Change to script directory
cd "$(dirname "$0")"

echo "======================================================="
echo "         Land Parcel Management System (LPMS)"
echo "              Updating Application..."
echo "======================================================="
echo ""

# 1. Check Git
if ! command -v git >/dev/null 2>&1; then
    echo "[ERROR] Git is not installed. Please install Git first."
    exit 1
fi

# 2. Check Docker
if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker service is not running or current user lacks docker permissions."
    echo "Tip: Try 'sudo systemctl start docker' or run script with sudo."
    exit 1
fi

COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE="docker-compose"
    else
        echo "[ERROR] Neither 'docker compose' nor 'docker-compose' was found."
        exit 1
    fi
fi

# 3. Pull latest changes from demo-branch
echo "[*] Stashing any local changes..."
git stash

echo "[*] Checking out demo-branch..."
git checkout demo-branch

echo "[*] Pulling latest updates from GitHub..."
git pull origin demo-branch

# 4. Read APP_PORT from .env (defaults to 8080)
APP_PORT=$(grep -E "^APP_PORT=" .env 2>/dev/null | cut -d '=' -f2 | tr -d '\r' || echo "8080")
if [ -z "$APP_PORT" ]; then
    APP_PORT="8080"
fi

# 5. Rebuild and restart containers
echo ""
echo "[*] Rebuilding and restarting containers with latest code..."
echo "    (This may take a few minutes)"
echo ""
$COMPOSE up -d --build

HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$HOST_IP" ]; then
    HOST_IP="<this-server-ip>"
fi

echo ""
echo "======================================================="
echo "  LPMS has been successfully updated and restarted!"
echo ""
echo "  Access the app in your browser:"
echo "    - On this machine:    http://localhost:$APP_PORT"
echo "    - Across office LAN:  http://$HOST_IP:$APP_PORT"
echo "======================================================="
echo ""
