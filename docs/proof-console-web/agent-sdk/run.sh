#!/usr/bin/env bash
# Start proof-console-web with MiniMax credentials.
#
# The MiniMax token already lives in the user's ~/.zshrc `claudefast` function.
# We extract it at runtime and export it into this process only — it is never
# written to disk, never committed, never echoed.
set -euo pipefail
cd "$(dirname "$0")"

ZSHRC="${ZSHRC:-$HOME/.zshrc}"

# Precedence: existing env > .env file > token mined from ~/.zshrc claudefast().
if [[ -z "${ANTHROPIC_API_KEY:-}" && -f .env ]]; then
  set -a; source .env; set +a
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  if [[ -f "$ZSHRC" ]]; then
    TOKEN="$(grep -oE 'sk-cp-[A-Za-z0-9_-]+' "$ZSHRC" | head -n1 || true)"
  fi
  if [[ -z "${TOKEN:-}" ]]; then
    echo "ERROR: no ANTHROPIC_API_KEY in env/.env and no sk-cp- token in $ZSHRC" >&2
    echo "       copy .env.example to .env and fill ANTHROPIC_API_KEY, or run claudefast once." >&2
    exit 1
  fi
  export ANTHROPIC_API_KEY="$TOKEN"
fi

export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://api.minimaxi.com/anthropic}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-MiniMax-M2.7-highspeed}"
export ANTHROPIC_DEFAULT_OPUS_MODEL="${ANTHROPIC_DEFAULT_OPUS_MODEL:-$ANTHROPIC_MODEL}"
export ANTHROPIC_DEFAULT_SONNET_MODEL="${ANTHROPIC_DEFAULT_SONNET_MODEL:-$ANTHROPIC_MODEL}"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="${ANTHROPIC_DEFAULT_HAIKU_MODEL:-$ANTHROPIC_MODEL}"
unset ANTHROPIC_AUTH_TOKEN || true
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8920}"

if [[ ! -f dist/server.js || src/server.ts -nt dist/server.js ]]; then
  echo "building…"
  npm run build
fi

echo "starting proof-console-web on http://${HOST}:${PORT}  (model=${ANTHROPIC_MODEL})"
exec node dist/server.js
