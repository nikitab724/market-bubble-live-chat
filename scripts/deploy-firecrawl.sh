#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${MARKET_BUBBLE_ROOT:-/opt/market-bubble-live}"
APP_DIR="${APP_DIR:-$ROOT_DIR/app}"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/data}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
IMAGE_NAME="${IMAGE_NAME:-market-bubble-live:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-market-bubble-live}"
HOST_PORT="${HOST_PORT:-4178}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"
if [ ! -f "$DATA_DIR/sources.json" ]; then
  cp "$APP_DIR/data/sources.json" "$DATA_DIR/sources.json"
fi

docker build -t "$IMAGE_NAME" "$APP_DIR"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p "127.0.0.1:$HOST_PORT:4178" \
  -v "$DATA_DIR:/app/data" \
  "$IMAGE_NAME"

docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
