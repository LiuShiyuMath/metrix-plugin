#!/usr/bin/env bash
# publish.sh — push a talk-html artifact to GitHub gist + record it in the index.
# usage: publish.sh <html-file> [--public]
#
# Default visibility: secret gist (link-only sharing). Pass --public to list it.

set -euo pipefail

HTML="${1:-}"
[[ -n "$HTML" ]] || { echo "usage: $0 <html-file> [--public]" >&2; exit 64; }
[[ -f "$HTML" ]] || { echo "file not found: $HTML" >&2; exit 66; }

# default --secret; pass --public to make it listed on profile
VIS_FLAG=""
[[ "${2:-}" == "--public" ]] && VIS_FLAG="--public"

command -v gh >/dev/null 2>&1 || {
  echo "gh CLI not installed. install: brew install gh" >&2
  echo "local file kept at: $HTML" >&2
  exit 69
}

gh auth status >/dev/null 2>&1 || {
  echo "gh not authed. run: gh auth login" >&2
  echo "local file kept at: $HTML" >&2
  exit 70
}

SLUG="$(basename "$HTML" .html)"
DESC="talk-html: $SLUG"
INDEX="$HOME/.claude/talk-html/index.jsonl"
mkdir -p "$(dirname "$INDEX")"

# push with up to 3 retries for transient 5xx
# gh writes progress to stderr ("- Creating gist...", "✓ Created..."), the URL itself
# to stdout. We capture both, then extract the URL line so we tolerate either layout.
URL=""
for attempt in 1 2 3; do
  RAW_OUT="$(gh gist create "$HTML" $VIS_FLAG --desc "$DESC" 2>&1)" || RAW_OUT="$RAW_OUT"
  URL="$(printf '%s\n' "$RAW_OUT" | grep -oE 'https://gist\.github\.com/[^[:space:]]+' | head -n 1)"
  [[ -n "$URL" ]] && break
  echo "gh gist create attempt $attempt failed:" >&2
  printf '%s\n' "$RAW_OUT" | sed 's/^/  /' >&2
  [[ $attempt -lt 3 ]] && sleep $((attempt * 2))
done

[[ -n "$URL" ]] || {
  echo "gh gist create failed after 3 attempts" >&2
  echo "local file kept at: $HTML" >&2
  exit 71
}

GIST_ID="${URL##*/}"
# parse user login directly from the gist URL — avoids a second auth call that occasionally
# returns empty under set -euo pipefail
USER_LOGIN="$(printf '%s\n' "$URL" | sed -E 's|^https://gist\.github\.com/([^/]+)/.*$|\1|')"
[[ -n "$USER_LOGIN" && "$USER_LOGIN" != "$URL" ]] || USER_LOGIN="$(gh api user --jq .login 2>/dev/null || echo unknown)"
FILENAME="$(basename "$HTML")"
RAW="https://gist.githubusercontent.com/${USER_LOGIN}/${GIST_ID}/raw/${FILENAME}"
RENDERED="https://htmlpreview.github.io/?${RAW}"

# best-effort: extract meta json from HTML comment to enrich index
META="$(grep -m1 -oE '<!-- *talk-html-meta *\{.*\} *-->' "$HTML" 2>/dev/null \
  | sed -E 's/^<!-- *talk-html-meta *//; s/ *-->$//' || true)"
[[ -z "$META" ]] && META='{}'

# validate META is parseable JSON; else fall back
echo "$META" | jq -e . >/dev/null 2>&1 || META='{}'

jq -nc \
  --arg slug "$SLUG" \
  --arg local "$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")" \
  --arg gist_id "$GIST_ID" \
  --arg gist_url "$URL" \
  --arg raw_url "$RAW" \
  --arg rendered "$RENDERED" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson meta "$META" \
  '{slug:$slug, local:$local, gist_id:$gist_id, gist_url:$gist_url, raw_url:$raw_url, rendered_url:$rendered, created_at:$ts, meta:$meta}' \
  >> "$INDEX"

cat <<EOF
local:    file://$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")
gist:     $URL
raw:      $RAW
rendered: $RENDERED
EOF
