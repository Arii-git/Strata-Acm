#!/usr/bin/env bash
# Runs every time the codespace starts: builds (first time) and starts STRATA in the background.
set -u
cd "$(dirname "$0")/.."

if [ -n "${CODESPACE_NAME:-}" ]; then
  # Links in emails point at this codespace's public address.
  export APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi

echo "[strata] starting (first start builds the images and generates data: about 8-10 minutes)..."
docker compose up -d --build

# Try to make the app link public so anyone can open it (falls back to manual: Ports tab > Visibility > Public).
if [ -n "${CODESPACE_NAME:-}" ] && command -v gh >/dev/null 2>&1; then
  gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" >/dev/null 2>&1 \
    && echo "[strata] port 3000 is public" \
    || echo "[strata] set port 3000 to Public in the Ports tab to share the link"
fi

echo "[strata] app link: ${APP_URL:-http://localhost:3000}"
echo "[strata] watch progress: docker compose logs -f engine"
