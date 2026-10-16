#!/usr/bin/env bash
set -e

# Change to script directory
cd "$(dirname "$0")"

echo "======================================================="
echo "         Land Parcel Management System (LPMS)"
echo "               Stopping Local Server..."
echo "======================================================="
echo ""

COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE="docker-compose"
    fi
fi

$COMPOSE down
echo ""
echo "[*] LPMS containers have been stopped."
echo ""
